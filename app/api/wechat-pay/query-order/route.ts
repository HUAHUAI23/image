/**
 * 查询微信支付订单状态
 * GET /api/wechat-pay/query-order?outTradeNo=xxx
 * GET /api/wechat-pay/query-order?chargeOrderId=123
 *
 * 用途：
 * 1. 前端轮询查询订单状态
 * 2. 手动对账
 * 3. 回调失败时的兜底查询
 */

import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

import { db } from '@/db'
import { accounts, chargeOrders, transactions } from '@/db/schema'
import { getSession } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { queryOrderByOutTradeNo } from '@/lib/wechat-pay'

export async function GET(request: NextRequest) {
  try {
    // 1. 验证用户登录
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    // 2. 获取查询参数
    const { searchParams } = new URL(request.url)
    const outTradeNo = searchParams.get('outTradeNo')
    const chargeOrderId = searchParams.get('chargeOrderId')

    if (!outTradeNo && !chargeOrderId) {
      return NextResponse.json(
        {
          error: '请提供 outTradeNo 或 chargeOrderId',
        },
        { status: 400 }
      )
    }

    // 3. 查询本地订单
    const [localOrder] = await db
      .select()
      .from(chargeOrders)
      .where(
        outTradeNo
          ? eq(chargeOrders.outTradeNo, outTradeNo)
          : eq(chargeOrders.id, parseInt(chargeOrderId!))
      )
      .limit(1)

    if (!localOrder) {
      return NextResponse.json({ error: '订单不存在' }, { status: 404 })
    }

    // 4. 验证订单所属权（安全检查）
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, localOrder.accountId))
      .limit(1)

    if (!account || account.userId !== session.userId) {
      logger.warn(
        {
          userId: session.userId,
          accountId: localOrder.accountId,
          outTradeNo: localOrder.outTradeNo,
        },
        '用户尝试查询他人订单'
      )
      return NextResponse.json({ error: '无权限查询此订单' }, { status: 403 })
    }

    // 5. 如果本地订单已成功/失败/关闭，直接返回
    if (['success', 'failed', 'closed'].includes(localOrder.status)) {
      return NextResponse.json({
        success: true,
        data: {
          chargeOrderId: localOrder.id,
          outTradeNo: localOrder.outTradeNo,
          status: localOrder.status,
          amount: localOrder.amount,
          paidAt: localOrder.paidAt,
          createdAt: localOrder.createdAt,
        },
      })
    }

    // 6. 订单处于 pending 状态，查询微信支付平台
    logger.info(
      {
        outTradeNo: localOrder.outTradeNo,
      },
      '查询微信支付订单状态'
    )

    let wechatOrder
    try {
      wechatOrder = await queryOrderByOutTradeNo(localOrder.outTradeNo)
    } catch (error) {
      logger.error(error, '查询微信订单失败')
      // 查询失败不影响返回本地状态
      return NextResponse.json({
        success: true,
        data: {
          chargeOrderId: localOrder.id,
          outTradeNo: localOrder.outTradeNo,
          status: localOrder.status,
          amount: localOrder.amount,
          createdAt: localOrder.createdAt,
          wechatQueryFailed: true,
        },
      })
    }

    // 7. 如果微信显示已支付，但本地未更新，执行原子更新（兜底逻辑）
    if (wechatOrder.trade_state === 'SUCCESS' && localOrder.status === 'pending') {
      logger.warn(
        {
          outTradeNo: localOrder.outTradeNo,
          localStatus: localOrder.status,
          wechatStatus: wechatOrder.trade_state,
        },
        '发现订单状态不一致，执行兜底更新'
      )

      await db.transaction(async (tx) => {
        // 7.1 锁定订单
        const [order] = await tx
          .select()
          .from(chargeOrders)
          .where(eq(chargeOrders.id, localOrder.id))
          .for('update')

        // 幂等性检查
        if (order.status !== 'pending') {
          logger.info(
            {
              outTradeNo: order.outTradeNo,
              status: order.status,
            },
            '订单已被其他请求更新'
          )
          return
        }

        // 7.2 验证金额
        if (wechatOrder.amount?.total !== order.amount) {
          logger.error(
            {
              outTradeNo: order.outTradeNo,
              expected: order.amount,
              actual: wechatOrder.amount?.total,
            },
            '支付金额不匹配'
          )
          throw new Error('支付金额不匹配')
        }

        // 7.3 锁定账户
        const [acc] = await tx
          .select()
          .from(accounts)
          .where(eq(accounts.id, order.accountId))
          .for('update')

        if (!acc) {
          throw new Error('账户不存在')
        }

        // 7.4 更新订单状态
        await tx
          .update(chargeOrders)
          .set({
            status: 'success',
            externalTransactionId: wechatOrder.transaction_id,
            paidAt: wechatOrder.success_time ? new Date(wechatOrder.success_time) : new Date(),
            metadata: {
              ...(order.metadata as any),
              wechatPayload: wechatOrder,
              updatedBy: 'query-order', // 标记是通过查询接口更新的
            },
          })
          .where(eq(chargeOrders.id, order.id))

        // 7.5 创建交易记录
        const newBalance = acc.balance + order.amount
        const [txn] = await tx
          .insert(transactions)
          .values({
            accountId: acc.id,
            category: 'recharge',
            amount: order.amount,
            balanceBefore: acc.balance,
            balanceAfter: newBalance,
            chargeOrderId: order.id,
            externalOrderId: wechatOrder.transaction_id, // 微信支付交易号
            paymentMethod: 'wechat',
            metadata: {
              description: `微信支付充值 ¥${(order.amount / 100).toFixed(2)}（查询兜底）`,
              paymentDetails: {
                platform: 'wechat',
                platformOrderId: wechatOrder.transaction_id,
                merchantOrderId: order.outTradeNo,
                tradeState: wechatOrder.trade_state,
                paymentTime: wechatOrder.success_time,
                updatedBy: 'query-order',
              },
            },
          })
          .returning()

        // 7.6 更新账户余额
        await tx
          .update(accounts)
          .set({
            balance: newBalance,
          })
          .where(eq(accounts.id, acc.id))

        // 7.7 关联交易ID
        await tx
          .update(chargeOrders)
          .set({
            transactionId: txn.id,
          })
          .where(eq(chargeOrders.id, order.id))

        logger.info(
          {
            chargeOrderId: order.id,
            transactionId: txn.id,
            outTradeNo: order.outTradeNo,
            amount: order.amount,
          },
          '通过查询接口完成订单更新'
        )
      })

      // 重新查询更新后的订单
      const [updatedOrder] = await db
        .select()
        .from(chargeOrders)
        .where(eq(chargeOrders.id, localOrder.id))
        .limit(1)

      return NextResponse.json({
        success: true,
        data: {
          chargeOrderId: updatedOrder.id,
          outTradeNo: updatedOrder.outTradeNo,
          status: updatedOrder.status,
          amount: updatedOrder.amount,
          paidAt: updatedOrder.paidAt,
          createdAt: updatedOrder.createdAt,
          wechatOrder: {
            trade_state: wechatOrder.trade_state,
            transaction_id: wechatOrder.transaction_id,
          },
        },
      })
    }

    // 8. 返回当前状态
    return NextResponse.json({
      success: true,
      data: {
        chargeOrderId: localOrder.id,
        outTradeNo: localOrder.outTradeNo,
        status: localOrder.status,
        amount: localOrder.amount,
        paidAt: localOrder.paidAt,
        createdAt: localOrder.createdAt,
        wechatOrder: {
          trade_state: wechatOrder.trade_state,
          trade_state_desc: wechatOrder.trade_state_desc,
          transaction_id: wechatOrder.transaction_id,
        },
      },
    })
  } catch (error) {
    logger.error(error, '查询订单失败')

    return NextResponse.json(
      {
        error: '查询订单失败，请稍后重试',
      },
      { status: 500 }
    )
  }
}
