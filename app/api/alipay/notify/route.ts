/**
 * 支付宝异步通知处理
 * POST /api/alipay/notify
 *
 * 支付宝在支付成功后会主动发送回调通知
 * 必须返回 success 字符串才能停止重试
 * 重试逻辑：立即重试3次，然后 4m、10m、10m、1h、2h、6h、15h
 *
 * 文档：https://opendocs.alipay.com/open/270/105902
 */

import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

import { db } from '@/db'
import { accounts, chargeOrders, transactions } from '@/db/schema'
import { verifyNotificationSignature } from '@/lib/alipay'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    // 1. 解析支付宝 POST 回调参数（application/x-www-form-urlencoded）
    const formData = await request.formData()
    const params: Record<string, any> = {}

    formData.forEach((value, key) => {
      params[key] = value.toString()
    })

    logger.info(
      {
        notify_type: params.notify_type,
        trade_status: params.trade_status,
        out_trade_no: params.out_trade_no,
      },
      '收到支付宝异步通知'
    )

    // 2. 验证签名
    const isSignatureValid = verifyNotificationSignature(params)

    if (!isSignatureValid) {
      logger.error(
        {
          notify_id: params.notify_id,
          out_trade_no: params.out_trade_no,
        },
        '支付宝回调签名验证失败'
      )
      return new NextResponse('fail', { status: 400 })
    }

    // 3. 校验通知类型
    if (params.notify_type !== 'trade_status_sync') {
      logger.warn({ notify_type: params.notify_type }, '忽略非交易状态同步通知')
      return new NextResponse('success', { status: 200 })
    }

    // 4. 只处理支付成功通知
    if (params.trade_status !== 'TRADE_SUCCESS') {
      logger.warn(
        {
          trade_status: params.trade_status,
          out_trade_no: params.out_trade_no,
        },
        '忽略非支付成功状态'
      )
      // 返回 success 避免支付宝重试
      return new NextResponse('success', { status: 200 })
    }

    // 5. 提取关键参数
    const {
      out_trade_no,
      trade_no,
      trade_status,
      total_amount,
      buyer_pay_amount,
      receipt_amount,
      buyer_logon_id,
      buyer_id,
      buyer_open_id,
      gmt_payment,
      subject,
      body,
    } = params

    logger.info(
      {
        out_trade_no,
        trade_no,
        trade_status,
        total_amount,
      },
      '支付宝回调参数解析完成'
    )

    // 6. 原子性处理订单和余额更新
    await db.transaction(async (tx) => {
      // 6.1 锁定并查询充值订单
      const [chargeOrder] = await tx
        .select()
        .from(chargeOrders)
        .where(eq(chargeOrders.outTradeNo, out_trade_no))
        .for('update')

      if (!chargeOrder) {
        logger.error({ out_trade_no }, '充值订单不存在')
        throw new Error(`订单不存在: ${out_trade_no}`)
      }

      // 6.2 幂等性检查：如果订单已处理，直接返回成功
      if (chargeOrder.status === 'success') {
        logger.info(
          {
            out_trade_no,
            chargeOrderId: chargeOrder.id,
          },
          '订单已处理，跳过（幂等性保护）'
        )
        return
      }

      // 6.3 验证订单状态必须是 pending
      if (chargeOrder.status !== 'pending') {
        logger.error(
          {
            out_trade_no,
            status: chargeOrder.status,
          },
          '订单状态异常'
        )
        throw new Error(`订单状态异常: ${chargeOrder.status}`)
      }

      // 6.4 验证支付金额（支付宝返回的是字符串格式的元）
      const alipayAmountInFen = Math.round(parseFloat(total_amount) * 100)
      if (alipayAmountInFen !== chargeOrder.amount) {
        logger.error(
          {
            out_trade_no,
            expected: chargeOrder.amount,
            actual: alipayAmountInFen,
          },
          '支付金额不匹配'
        )
        throw new Error('支付金额不匹配')
      }

      // 6.5 锁定并获取账户
      const [account] = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.id, chargeOrder.accountId))
        .for('update')

      if (!account) {
        logger.error(
          {
            accountId: chargeOrder.accountId,
          },
          '账户不存在'
        )
        throw new Error('账户不存在')
      }

      // 6.6 更新充值订单状态为成功
      await tx
        .update(chargeOrders)
        .set({
          status: 'success',
          externalTransactionId: trade_no,
          paidAt: gmt_payment ? new Date(gmt_payment) : new Date(),
          metadata: {
            ...(chargeOrder.metadata as any),
            alipayPayload: {
              trade_no,
              trade_status,
              total_amount,
              buyer_pay_amount,
              receipt_amount,
              buyer_logon_id,
              buyer_id,
              buyer_open_id,
              gmt_payment,
              subject,
              body,
            },
          },
        })
        .where(eq(chargeOrders.id, chargeOrder.id))

      // 6.7 创建交易记录
      const newBalance = account.balance + chargeOrder.amount
      const [txn] = await tx
        .insert(transactions)
        .values({
          accountId: account.id,
          category: 'recharge',
          amount: chargeOrder.amount,
          balanceBefore: account.balance,
          balanceAfter: newBalance,
          chargeOrderId: chargeOrder.id,
          externalOrderId: trade_no, // 支付宝交易号
          paymentMethod: 'alipay',
          metadata: {
            description: `支付宝充值 ¥${(chargeOrder.amount / 100).toFixed(2)}`,
            paymentDetails: {
              platform: 'alipay',
              platformOrderId: trade_no,
              merchantOrderId: out_trade_no,
              tradeStatus: trade_status,
              paymentTime: gmt_payment,
              buyerLogonId: buyer_logon_id,
              buyerId: buyer_id,
              buyerOpenId: buyer_open_id,
            },
          },
        })
        .returning()

      // 6.8 更新账户余额
      await tx
        .update(accounts)
        .set({
          balance: newBalance,
        })
        .where(eq(accounts.id, account.id))

      // 6.9 将交易ID关联到充值订单
      await tx
        .update(chargeOrders)
        .set({
          transactionId: txn.id,
        })
        .where(eq(chargeOrders.id, chargeOrder.id))

      logger.info(
        {
          userId: account.userId,
          accountId: account.id,
          chargeOrderId: chargeOrder.id,
          transactionId: txn.id,
          out_trade_no,
          trade_no,
          amount: chargeOrder.amount,
          balanceBefore: account.balance,
          balanceAfter: newBalance,
        },
        '支付宝充值成功'
      )
    })

    // 7. 返回成功响应（停止支付宝重试）
    // 官方文档要求：验签成功后必须返回 success 字符串
    return new NextResponse('success', { status: 200 })
  } catch (error) {
    logger.error(error, '处理支付宝回调失败')

    // 返回 fail 触发支付宝重试
    return new NextResponse('fail', { status: 500 })
  }
}
