'use server'

/**
 * 支付配置相关 Server Actions
 * 🔒 所有 actions 都需要用户登录
 */

import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { paymentConfigs } from '@/db/schema'
import { getSession } from '@/lib/auth'
import { logger } from '@/lib/logger'

/**
 * 支付配置返回类型（不包含敏感信息）
 */
export interface PaymentConfigPublic {
  provider: 'wechat' | 'alipay' | 'stripe'
  displayName: string
  description: string | null
  icon: string | null
  sortOrder: number
  presetAmounts: number[]
  minAmount: number
  maxAmount: number
}

/**
 * 获取所有启用的支付方式配置
 * 🔒 需要用户登录
 *
 * @returns 启用的支付配置列表
 * @throws {Error} 未授权或查询失败
 */
export async function getEnabledPaymentConfigs(): Promise<PaymentConfigPublic[]> {
  // 🔒 鉴权：要求用户必须登录
  const session = await getSession()
  if (!session?.userId) {
    throw new Error('未授权访问')
  }

  try {
    // 查询所有启用的支付配置，按排序字段排序
    const enabledConfigs = await db
      .select({
        provider: paymentConfigs.provider,
        displayName: paymentConfigs.displayName,
        description: paymentConfigs.description,
        icon: paymentConfigs.icon,
        sortOrder: paymentConfigs.sortOrder,
        presetAmounts: paymentConfigs.presetAmounts,
        minAmount: paymentConfigs.minAmount,
        maxAmount: paymentConfigs.maxAmount,
        // ⚠️ 不返回 publicConfig，避免暴露 appid、mchid、publicKey 等敏感信息
      })
      .from(paymentConfigs)
      .where(eq(paymentConfigs.status, 'enabled'))
      .orderBy(paymentConfigs.sortOrder)

    logger.info(
      {
        userId: session.userId,
        count: enabledConfigs.length,
        providers: enabledConfigs.map((c) => c.provider),
      },
      '查询启用的支付配置'
    )

    return enabledConfigs
  } catch (error) {
    logger.error(error, '获取支付配置失败')
    throw new Error('获取支付配置失败')
  }
}
