/**
 * 初始化支付配置脚本
 * 用于首次部署时创建默认的支付配置
 *
 * 运行方式:
 * pnpm tsx --env-file=.env scripts/init-payment-configs.ts
 */

import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { paymentConfigs } from '@/db/schema'
import { logger } from '@/lib/logger'

async function initPaymentConfigs() {
  try {
    logger.info('开始初始化支付配置...')

    // 1. 检查并创建微信支付配置
    const existingWechat = await db
      .select()
      .from(paymentConfigs)
      .where(eq(paymentConfigs.provider, 'wechat'))
      .limit(1)

    if (existingWechat.length === 0) {
      const [wechatConfig] = await db
        .insert(paymentConfigs)
        .values({
          provider: 'wechat',
          displayName: '微信支付',
          description: '使用微信扫码完成充值',
          icon: 'https://res.wx.qq.com/a/wx_fed/assets/res/NTI4MWU5.ico',
          status: 'enabled', // 默认启用
          sortOrder: 0, // 排序：0（第一位）
          minAmount: 1, // 最小充值1元
          maxAmount: 10000, // 最大充值10000元
          presetAmounts: [10, 50, 100, 500], // 预设金额
          publicConfig: {
            orderTimeoutMinutes: 10, // 订单超时时间（分钟）
          },
        })
        .returning()

      logger.info(
        {
          id: wechatConfig.id,
          provider: wechatConfig.provider,
          displayName: wechatConfig.displayName,
        },
        '微信支付配置初始化成功'
      )
    } else {
      logger.info('微信支付配置已存在，跳过初始化')
    }

    // 2. 检查并创建支付宝支付配置
    const existingAlipay = await db
      .select()
      .from(paymentConfigs)
      .where(eq(paymentConfigs.provider, 'alipay'))
      .limit(1)

    if (existingAlipay.length === 0) {
      const [alipayConfig] = await db
        .insert(paymentConfigs)
        .values({
          provider: 'alipay',
          displayName: '支付宝',
          description: '使用支付宝扫码完成充值',
          icon: 'https://img.alicdn.com/tfs/TB1qEwuzrj1gK0jSZFOXXc7GpXa-32-32.ico',
          status: 'enabled', // 默认启用
          sortOrder: 1, // 排序：1（第二位）
          minAmount: 1, // 最小充值1元
          maxAmount: 10000, // 最大充值10000元
          presetAmounts: [10, 50, 100, 500], // 预设金额
          publicConfig: {
            orderTimeoutMinutes: 10, // 订单超时时间（分钟）
          },
        })
        .returning()

      logger.info(
        {
          id: alipayConfig.id,
          provider: alipayConfig.provider,
          displayName: alipayConfig.displayName,
        },
        '支付宝支付配置初始化成功'
      )
    } else {
      logger.info('支付宝支付配置已存在，跳过初始化')
    }

    logger.info('=== 后续步骤 ===')
    logger.info('1. 确认 .env 文件中的支付环境变量已正确配置')
    logger.info('')
    logger.info('   微信支付:')
    logger.info('   - WECHAT_PAY_APPID')
    logger.info('   - WECHAT_PAY_MCHID')
    logger.info('   - WECHAT_PAY_API_V3_KEY')
    logger.info('   - WECHAT_PAY_SERIAL_NO')
    logger.info('   - WECHAT_PAY_PRIVATE_KEY')
    logger.info('   - WECHAT_PAY_NOTIFY_URL')
    logger.info('')
    logger.info('   支付宝支付:')
    logger.info('   - ALIPAY_APPID')
    logger.info('   - ALIPAY_PRIVATE_KEY')
    logger.info('   - ALIPAY_PUBLIC_KEY')
    logger.info('   - ALIPAY_NOTIFY_URL')
    logger.info('')
    logger.info('2. 在支付平台配置回调地址:')
    logger.info('   微信回调: process.env.WECHAT_PAY_NOTIFY_URL')
    logger.info('   支付宝回调: process.env.ALIPAY_NOTIFY_URL')
    logger.info('')
    logger.info('3. 根据需要在管理后台调整支付配置参数')
    logger.info('   - 最小/最大充值金额')
    logger.info('   - 预设充值金额')
    logger.info('   - 订单超时时间')
    logger.info('   - 启用/禁用状态')
    logger.info('   - 显示顺序')
    logger.info('')
    logger.info('初始化完成！')
  } catch (error) {
    logger.error(error, '初始化支付配置失败')
    throw error
  }
}

// 执行初始化
initPaymentConfigs()
  .then(() => {
    logger.info('脚本执行完成')
    process.exit(0)
  })
  .catch((error) => {
    logger.error(error, '脚本执行失败')
    process.exit(1)
  })
