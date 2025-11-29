/**
 * 微信支付回调通知处理
 * POST /api/wechat-pay/notify
 *
 * 微信支付在支付成功后会主动发送回调通知
 * 必须返回 200/204 才能停止重试（最多重试15次）
 */

import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

import { db } from '@/db'
import { accounts, chargeOrders, transactions } from '@/db/schema'
import { logger } from '@/lib/logger'
import { decryptNotificationResource, verifyNotificationSignature } from '@/lib/wechat-pay'

export async function POST(request: NextRequest) {
  try {
    // 1. 获取微信签名相关头部
    const timestamp = request.headers.get('wechatpay-timestamp')
    const nonce = request.headers.get('wechatpay-nonce')
    const signature = request.headers.get('wechatpay-signature')
    const serialNo = request.headers.get('wechatpay-serial')

    if (!timestamp || !nonce || !signature || !serialNo) {
      logger.error(
        {
          timestamp,
          nonce,
          signature,
          serialNo,
        },
        '微信回调缺少必要的签名头部'
      )
      return NextResponse.json({ code: 'FAIL', message: '缺少签名头部' }, { status: 400 })
    }

    // 2. 获取原始请求体（用于验签）
    const rawBody = await request.text()

    // 3. 验证签名
    const isSignatureValid = verifyNotificationSignature(
      timestamp,
      nonce,
      rawBody,
      signature,
      serialNo
    )

    if (!isSignatureValid) {
      logger.error(
        {
          timestamp,
          nonce,
          serialNo,
        },
        '微信回调签名验证失败'
      )
      return NextResponse.json({ code: 'FAIL', message: '签名验证失败' }, { status: 401 })
    }

    // 4. 解析请求体
    const body = JSON.parse(rawBody)
    const { event_type, resource } = body

    logger.info(
      {
        event_type,
        resource_algorithm: resource?.algorithm,
      },
      '收到微信支付回调'
    )

    // 5. 只处理支付成功通知
    if (event_type !== 'TRANSACTION.SUCCESS') {
      logger.warn({ event_type }, '忽略非支付成功事件')
      // 返回成功避免重试
      return new NextResponse(null, { status: 204 })
    }

    // 6. 解密回调数据
    const decryptedData = decryptNotificationResource(
      resource.ciphertext,
      resource.associated_data,
      resource.nonce
    )

    const {
      out_trade_no,
      transaction_id,
      trade_state,
      trade_state_desc,
      success_time,
      amount,
      payer,
    } = decryptedData

    logger.info(
      {
        out_trade_no,
        transaction_id,
        trade_state,
        total_amount: amount?.total,
      },
      '解密回调数据成功'
    )

    // 7. 验证支付状态
    if (trade_state !== 'SUCCESS') {
      logger.warn(
        {
          out_trade_no,
          trade_state,
          trade_state_desc,
        },
        '支付未成功'
      )
      return new NextResponse(null, { status: 204 })
    }

    // 8. 原子性处理订单和余额更新
    await db.transaction(async (tx) => {
      // 8.1 锁定并查询充值订单
      const [chargeOrder] = await tx
        .select()
        .from(chargeOrders)
        .where(eq(chargeOrders.outTradeNo, out_trade_no))
        .for('update')

      if (!chargeOrder) {
        logger.error({ out_trade_no }, '充值订单不存在')
        throw new Error(`订单不存在: ${out_trade_no}`)
      }

      // 8.2 幂等性检查：如果订单已处理，直接返回成功
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

      // 8.3 验证订单状态必须是 pending
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

      // 8.4 验证支付金额
      if (amount?.total !== chargeOrder.amount) {
        logger.error(
          {
            out_trade_no,
            expected: chargeOrder.amount,
            actual: amount?.total,
          },
          '支付金额不匹配'
        )
        throw new Error('支付金额不匹配')
      }

      // 8.5 锁定并获取账户
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

      // 8.6 更新充值订单状态为成功
      await tx
        .update(chargeOrders)
        .set({
          status: 'success',
          externalTransactionId: transaction_id,
          paidAt: new Date(success_time),
          metadata: {
            ...(chargeOrder.metadata as any),
            wechatPayload: {
              transaction_id,
              trade_state,
              trade_state_desc,
              success_time,
              payer_openid: payer?.openid,
              amount: amount?.total,
            },
          },
        })
        .where(eq(chargeOrders.id, chargeOrder.id))

      // 8.7 创建交易记录
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
          externalOrderId: transaction_id, // 微信支付交易号
          paymentMethod: 'wechat',
          metadata: {
            description: `微信支付充值 ¥${(chargeOrder.amount / 100).toFixed(2)}`,
            paymentDetails: {
              platform: 'wechat',
              platformOrderId: transaction_id,
              merchantOrderId: out_trade_no,
              tradeState: trade_state,
              paymentTime: success_time,
              payerOpenid: payer?.openid,
            },
          },
        })
        .returning()

      // 8.8 更新账户余额
      await tx
        .update(accounts)
        .set({
          balance: newBalance,
        })
        .where(eq(accounts.id, account.id))

      // 8.9 将交易ID关联到充值订单
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
          transaction_id,
          amount: chargeOrder.amount,
          balanceBefore: account.balance,
          balanceAfter: newBalance,
        },
        '微信支付充值成功'
      )
    })

    // 9. 返回成功响应（停止微信重试）
    // 官方文档要求：验签成功返回 200 或 204，无需返回应答报文
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    logger.error(error, '处理微信支付回调失败')

    // 返回 500 触发微信重试
    return NextResponse.json(
      {
        code: 'FAIL',
        message: '处理失败，请稍后重试',
      },
      { status: 500 }
    )
  }
}
