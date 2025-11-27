/**
 * 创建微信支付充值订单
 * POST /api/wechat-pay/create-order
 */

import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { db } from '@/db'
import { accounts, chargeOrders, paymentConfigs } from '@/db/schema'
import { getSession } from '@/lib/auth'
import { yuanToFen } from '@/lib/const'
import { logger } from '@/lib/logger'
import { createRechargeOrderSchema } from '@/lib/validations/wechat-pay'
import { createNativePayOrder } from '@/lib/wechat-pay'

export async function POST(request: NextRequest) {
  try {
    // 1. 验证用户登录
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    // 2. 验证请求参数
    const body = await request.json()
    const { amount } = createRechargeOrderSchema.parse(body)

    // 3. 查询微信支付配置
    const [wechatConfig] = await db
      .select()
      .from(paymentConfigs)
      .where(eq(paymentConfigs.provider, 'wechat'))
      .limit(1)

    if (!wechatConfig || wechatConfig.status === 'disabled') {
      return NextResponse.json({ error: '微信支付暂不可用' }, { status: 503 })
    }

    // 4. 验证充值金额范围
    if (amount < wechatConfig.minAmount || amount > wechatConfig.maxAmount) {
      return NextResponse.json(
        {
          error: `充值金额必须在 ${wechatConfig.minAmount}-${wechatConfig.maxAmount} 元之间`,
        },
        { status: 400 }
      )
    }

    // 5. 获取用户账户
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, session.userId))
      .limit(1)

    if (!account) {
      return NextResponse.json({ error: '账户不存在' }, { status: 404 })
    }

    // 6. 生成商户订单号
    // 格式: WX + 时间戳 + 用户ID + 随机数
    const outTradeNo = `WX${Date.now()}${session.userId}${Math.random().toString(36).substring(2, 8).toUpperCase()}`

    // 7. 计算订单过期时间 (10分钟)
    const orderTimeoutMinutes = wechatConfig.publicConfig?.orderTimeoutMinutes || 10
    const expireTime = new Date(Date.now() + orderTimeoutMinutes * 60 * 1000)

    // 8. 调用微信支付下单接口
    const { codeUrl } = await createNativePayOrder({
      outTradeNo,
      description: `账户充值-${amount}元`,
      totalAmount: yuanToFen(amount),
      timeExpire: expireTime.toISOString().replace(/\.\d{3}Z$/, '+08:00'), // RFC3339 格式
      attach: JSON.stringify({
        userId: session.userId,
        accountId: account.id,
        amount,
      }),
    })

    // 9. 创建充值订单记录 (status=pending)
    const [chargeOrder] = await db
      .insert(chargeOrders)
      .values({
        accountId: account.id,
        amount: yuanToFen(amount),
        provider: 'wechat',
        outTradeNo,
        paymentCredential: {
          wechat: {
            codeUrl,
          },
        },
        status: 'pending',
        expireTime,
        metadata: {
          description: `微信支付充值 ¥${amount}`,
          ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
        },
      })
      .returning()

    logger.info(
      {
        userId: session.userId,
        accountId: account.id,
        chargeOrderId: chargeOrder.id,
        outTradeNo,
        amount,
      },
      '创建微信支付充值订单成功'
    )

    // 10. 返回订单信息
    return NextResponse.json({
      success: true,
      data: {
        chargeOrderId: chargeOrder.id,
        outTradeNo,
        codeUrl,
        amount,
        expireTime: orderTimeoutMinutes * 60, // 秒
        expireAt: expireTime.toISOString(),
      },
    })
  } catch (error) {
    logger.error(error, '创建微信支付充值订单失败')

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: '参数错误',
          details: error.issues,
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        error: '创建订单失败，请稍后重试',
      },
      { status: 500 }
    )
  }
}
