/**
 * 关闭支付宝订单
 * POST /api/alipay/close-order
 *
 * 用途：
 * 1. 用户主动取消订单
 * 2. 定时任务关闭超时订单
 *
 * 注意：
 * - 只能关闭 pending 状态的订单
 * - 关闭后订单状态变为 closed
 * - 支付宝平台也会同步撤销/关闭
 */

import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { db } from '@/db'
import { accounts, chargeOrders } from '@/db/schema'
import { cancelOrder as cancelAlipayOrder } from '@/lib/alipay'
import { getSession } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { closeOrderSchema } from '@/lib/validations/alipay'

export async function POST(request: NextRequest) {
  try {
    // 1. 验证用户登录
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    // 2. 验证请求参数
    const body = await request.json()
    const { outTradeNo } = closeOrderSchema.parse(body)

    // 3. 查询本地订单
    const [localOrder] = await db
      .select()
      .from(chargeOrders)
      .where(eq(chargeOrders.outTradeNo, outTradeNo))
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
          outTradeNo,
        },
        '用户尝试关闭他人订单'
      )
      return NextResponse.json({ error: '无权限关闭此订单' }, { status: 403 })
    }

    // 5. 检查订单状态
    if (localOrder.status === 'closed') {
      return NextResponse.json({
        success: true,
        message: '订单已关闭',
        data: {
          chargeOrderId: localOrder.id,
          outTradeNo,
          status: 'closed',
        },
      })
    }

    if (localOrder.status === 'success') {
      return NextResponse.json(
        {
          error: '订单已支付成功，无法关闭',
        },
        { status: 400 }
      )
    }

    if (localOrder.status === 'failed') {
      return NextResponse.json(
        {
          error: '订单已失败，无需关闭',
        },
        { status: 400 }
      )
    }

    // 6. 调用支付宝 API 撤销订单
    try {
      const result = await cancelAlipayOrder(outTradeNo)
      logger.info(
        {
          outTradeNo,
          retryFlag: result.retryFlag,
          action: result.action,
        },
        '支付宝订单撤销成功'
      )

      // 检查是否需要重试
      if (result.retryFlag === 'Y') {
        logger.warn(
          {
            outTradeNo,
          },
          '支付宝订单撤销需要重试'
        )
        // 这里可以实现重试逻辑，或者返回给前端让用户重试
        return NextResponse.json(
          {
            error: '订单关闭中，请稍后重试',
          },
          { status: 409 }
        )
      }
    } catch (error: any) {
      logger.error(
        {
          outTradeNo,
          error: error.message,
        },
        '支付宝订单撤销失败'
      )

      // 如果支付宝返回订单不存在或已关闭，我们仍然更新本地状态
      const errorMessage = error.message || ''
      if (
        !errorMessage.includes('TRADE_NOT_EXIST') &&
        !errorMessage.includes('REASON_TRADE_BEEN_FREEZEN') &&
        !errorMessage.includes('TRADE_HAS_CLOSE')
      ) {
        throw error
      }

      logger.info(
        {
          outTradeNo,
          errorMessage,
        },
        '支付宝订单已不存在或已关闭，继续更新本地状态'
      )
    }

    // 7. 更新本地订单状态
    const [updatedOrder] = await db
      .update(chargeOrders)
      .set({
        status: 'closed',
        metadata: {
          ...(localOrder.metadata as any),
          closedAt: new Date().toISOString(),
          closedBy: session.userId,
        },
      })
      .where(eq(chargeOrders.id, localOrder.id))
      .returning()

    logger.info(
      {
        userId: session.userId,
        chargeOrderId: localOrder.id,
        outTradeNo,
      },
      '订单关闭成功'
    )

    // 8. 返回成功响应
    return NextResponse.json({
      success: true,
      message: '订单已关闭',
      data: {
        chargeOrderId: updatedOrder.id,
        outTradeNo: updatedOrder.outTradeNo,
        status: updatedOrder.status,
      },
    })
  } catch (error) {
    logger.error(error, '关闭订单失败')

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
        error: '关闭订单失败，请稍后重试',
      },
      { status: 500 }
    )
  }
}
