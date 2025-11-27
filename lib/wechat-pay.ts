/**
 * 微信支付工具库
 * 基于 wechatpay-node-v3 官方 SDK
 * 文档：https://pay.weixin.qq.com/wiki/doc/apiv3/index.shtml
 */

import WxPay from 'wechatpay-node-v3'

import { env } from './env'
import { logger } from './logger'

// 微信支付 SDK 实例（懒加载）
let wxPayInstance: WxPay | null = null

/**
 * 检查微信支付是否已配置
 */
function checkWeChatPayConfig(): void {
  if (
    !env.WECHAT_PAY_APPID ||
    !env.WECHAT_PAY_MCHID ||
    !env.WECHAT_PAY_API_V3_KEY ||
    !env.WECHAT_PAY_SERIAL_NO ||
    !env.WECHAT_PAY_PRIVATE_KEY ||
    !env.WECHAT_PAY_PLATFORM_CERT ||
    !env.WECHAT_PAY_NOTIFY_URL
  ) {
    throw new Error('微信支付未配置，请在环境变量中设置 WECHAT_PAY_* 相关配置')
  }
}

/**
 * 检查微信支付是否已启用
 */
export function isWeChatPayEnabled(): boolean {
  return !!(
    env.WECHAT_PAY_APPID &&
    env.WECHAT_PAY_MCHID &&
    env.WECHAT_PAY_API_V3_KEY &&
    env.WECHAT_PAY_SERIAL_NO &&
    env.WECHAT_PAY_PRIVATE_KEY &&
    env.WECHAT_PAY_PLATFORM_CERT &&
    env.WECHAT_PAY_NOTIFY_URL
  )
}

/**
 * 获取微信支付 SDK 实例（单例模式）
 */
function getWxPaySDK(): WxPay {
  if (!wxPayInstance) {
    checkWeChatPayConfig()

    wxPayInstance = new WxPay({
      appid: env.WECHAT_PAY_APPID!,
      mchid: env.WECHAT_PAY_MCHID!,
      publicKey: Buffer.from(env.WECHAT_PAY_PLATFORM_CERT!),
      privateKey: Buffer.from(env.WECHAT_PAY_PRIVATE_KEY!),
      key: env.WECHAT_PAY_API_V3_KEY!,
      // serial_no 不是必须的，SDK 会自动获取
    })

    logger.info('微信支付 SDK 初始化成功')
  }

  return wxPayInstance
}

/**
 * Native 支付下单响应
 * 文档：https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter3_4_1.shtml
 */
interface NativePayResponse {
  code_url: string // 二维码链接
}

/**
 * 查询订单响应
 * 文档：https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter3_4_2.shtml
 */
interface QueryOrderResponse {
  appid: string
  mchid: string
  out_trade_no: string
  transaction_id?: string
  trade_type?: 'JSAPI' | 'NATIVE' | 'APP' | 'MICROPAY' | 'MWEB' | 'FACEPAY'
  trade_state: 'SUCCESS' | 'REFUND' | 'NOTPAY' | 'CLOSED' | 'REVOKED' | 'USERPAYING' | 'PAYERROR'
  trade_state_desc: string
  bank_type?: string
  attach?: string
  success_time?: string
  payer?: {
    openid: string
  }
  amount?: {
    total: number
    payer_total?: number
    currency?: string
    payer_currency?: string
  }
  scene_info?: {
    device_id?: string
  }
  promotion_detail?: Array<{
    coupon_id: string
    name?: string
    scope?: string
    type?: string
    amount: number
    stock_id?: string
    wechatpay_contribute?: number
    merchant_contribute?: number
    other_contribute?: number
    currency?: string
    goods_detail?: Array<{
      goods_id: string
      quantity: number
      unit_price: number
      discount_amount: number
      goods_remark?: string
    }>
  }>
}

/**
 * 回调通知解密后的资源数据
 * 文档：https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter3_4_5.shtml
 */
interface NotificationResource {
  appid: string
  mchid: string
  out_trade_no: string
  transaction_id: string
  trade_type: 'JSAPI' | 'NATIVE' | 'APP' | 'MICROPAY' | 'MWEB' | 'FACEPAY'
  trade_state: 'SUCCESS' | 'REFUND' | 'NOTPAY' | 'CLOSED' | 'REVOKED' | 'USERPAYING' | 'PAYERROR'
  trade_state_desc: string
  bank_type: string
  attach?: string
  success_time: string
  payer: {
    openid: string
  }
  amount: {
    total: number
    payer_total: number
    currency: string
    payer_currency: string
  }
  scene_info?: {
    device_id?: string
  }
  promotion_detail?: Array<{
    coupon_id: string
    name?: string
    scope?: string
    type?: string
    amount: number
    stock_id?: string
    wechatpay_contribute?: number
    merchant_contribute?: number
    other_contribute?: number
    currency?: string
    goods_detail?: Array<{
      goods_id: string
      quantity: number
      unit_price: number
      discount_amount: number
      goods_remark?: string
    }>
  }>
}

/**
 * 微信支付订单信息（对外暴露的接口）
 */
export interface WeChatOrder {
  appid: string
  mchid: string
  out_trade_no: string
  transaction_id?: string
  trade_type?: string
  trade_state: 'SUCCESS' | 'REFUND' | 'NOTPAY' | 'CLOSED' | 'REVOKED' | 'USERPAYING' | 'PAYERROR'
  trade_state_desc: string
  bank_type?: string
  attach?: string
  success_time?: string
  payer?: {
    openid: string
  }
  amount?: {
    total: number
    payer_total?: number
    currency?: string
    payer_currency?: string
  }
}

/**
 * Native 支付下单参数
 */
export interface NativePayOrderParams {
  outTradeNo: string // 商户订单号
  description: string // 商品描述
  totalAmount: number // 订单金额（分）
  timeExpire?: string // 支付截止时间（RFC3339 格式）
  attach?: string // 附加数据
}

/**
 * Native 支付下单
 * 文档：https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter3_4_1.shtml
 */
export async function createNativePayOrder(
  params: NativePayOrderParams
): Promise<{ codeUrl: string }> {
  checkWeChatPayConfig()

  const sdk = getWxPaySDK()

  try {
    logger.info(
      {
        outTradeNo: params.outTradeNo,
        totalAmount: params.totalAmount,
        description: params.description,
      },
      '开始调用微信下单接口'
    )

    const output = await sdk.transactions_native({
      appid: env.WECHAT_PAY_APPID!,
      mchid: env.WECHAT_PAY_MCHID!,
      description: params.description,
      out_trade_no: params.outTradeNo,
      time_expire: params.timeExpire,
      attach: params.attach,
      notify_url: env.WECHAT_PAY_NOTIFY_URL!,
      amount: {
        total: params.totalAmount,
        currency: 'CNY',
      },
    })

    // SDK 返回的 data 字段包含真实的业务数据
    const result = output.data as NativePayResponse

    // 检查是否成功返回支付二维码
    if (!result?.code_url) {
      logger.error(
        {
          status: output.status,
          error: output.error,
          errRaw: output.errRaw,
          data: output.data,
          outTradeNo: params.outTradeNo,
        },
        '微信下单失败: 未返回支付二维码'
      )
      throw new Error(`微信下单失败: HTTP ${output.status}, ${output.error || '未返回支付二维码'}`)
    }

    logger.info(
      {
        status: output.status,
        outTradeNo: params.outTradeNo,
        codeUrl: result.code_url,
      },
      '微信下单成功'
    )

    return { codeUrl: result.code_url }
  } catch (error) {
    logger.error(
      {
        error,
        outTradeNo: params.outTradeNo,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      '调用微信支付 Native 下单 API 失败'
    )
    throw error
  }
}

/**
 * 查询订单（通过商户订单号）
 * 文档：https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter3_4_2.shtml
 */
export async function queryOrderByOutTradeNo(outTradeNo: string): Promise<WeChatOrder> {
  checkWeChatPayConfig()

  const sdk = getWxPaySDK()

  try {
    logger.info(
      {
        outTradeNo,
      },
      '开始查询微信订单'
    )

    const output = await sdk.query({
      out_trade_no: outTradeNo,
    })

    // SDK 返回的 data 字段包含真实的业务数据
    const result = output.data as QueryOrderResponse

    if (!result) {
      logger.error(
        {
          status: output.status,
          error: output.error,
          errRaw: output.errRaw,
          data: output.data,
          outTradeNo,
        },
        '查询微信订单失败: 未返回订单信息'
      )
      throw new Error(`查询订单失败: HTTP ${output.status}, ${output.error || '未返回订单信息'}`)
    }

    logger.info(
      {
        status: output.status,
        outTradeNo,
        trade_state: result.trade_state,
        transaction_id: result.transaction_id,
      },
      '查询微信订单成功'
    )

    return {
      appid: result.appid,
      mchid: result.mchid,
      out_trade_no: result.out_trade_no,
      transaction_id: result.transaction_id,
      trade_type: result.trade_type,
      trade_state: result.trade_state,
      trade_state_desc: result.trade_state_desc,
      bank_type: result.bank_type,
      attach: result.attach,
      success_time: result.success_time,
      payer: result.payer,
      amount: result.amount,
    }
  } catch (error) {
    logger.error(
      {
        error,
        outTradeNo,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      '查询微信订单异常'
    )
    throw error
  }
}

/**
 * 关闭订单
 * 文档：https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter3_4_3.shtml
 */
export async function closeOrder(outTradeNo: string): Promise<void> {
  checkWeChatPayConfig()

  const sdk = getWxPaySDK()

  try {
    logger.info(
      {
        outTradeNo,
      },
      '开始关闭微信订单'
    )

    await sdk.close(outTradeNo)

    logger.info({ outTradeNo }, '关闭微信订单成功')
  } catch (error) {
    logger.error(
      {
        error,
        outTradeNo,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      '关闭微信订单异常'
    )
    throw error
  }
}

/**
 * 验证回调通知签名
 * 文档：https://pay.weixin.qq.com/wiki/doc/apiv3/wechatpay/wechatpay4_1.shtml
 *
 * @param timestamp 时间戳
 * @param nonce 随机字符串
 * @param body 请求体
 * @param signature 签名
 * @param serialNo 证书序列号
 * @returns 是否验证通过
 */
export function verifyNotificationSignature(
  timestamp: string,
  nonce: string,
  body: string,
  signature: string,
  serialNo: string
): boolean {
  try {
    checkWeChatPayConfig()

    const sdk = getWxPaySDK()

    // 1. 签名探测流量检测
    if (signature.startsWith('WECHATPAY/SIGNTEST/')) {
      logger.warn({ signature }, '检测到微信支付签名探测流量')
      return false
    }

    // 2. 时间戳验证（防重放攻击）
    const requestTime = parseInt(timestamp, 10)
    const currentTime = Math.floor(Date.now() / 1000)
    const timeDiff = Math.abs(currentTime - requestTime)

    if (timeDiff > 300) {
      // 5分钟 = 300秒
      logger.error(
        {
          timestamp,
          currentTime,
          timeDiff,
        },
        '回调通知时间戳已过期（超过5分钟）'
      )
      return false
    }

    // 3. 证书序列号验证
    if (!env.WECHAT_PAY_PLATFORM_CERT_SERIAL_NO) {
      logger.error('未配置微信支付平台证书序列号')
      return false
    }

    if (serialNo !== env.WECHAT_PAY_PLATFORM_CERT_SERIAL_NO) {
      logger.error(
        {
          received: serialNo,
          expected: env.WECHAT_PAY_PLATFORM_CERT_SERIAL_NO,
        },
        '平台证书序列号不匹配，请更新平台证书'
      )
      return false
    }

    // 4. 使用 SDK 验证签名
    const params = {
      timestamp,
      nonce,
      body,
      signature,
      serial: serialNo,
    }

    const isValid = sdk.verifySign(params) as unknown as boolean

    if (!isValid) {
      logger.error(
        {
          timestamp,
          nonce,
          serialNo,
        },
        '微信支付回调签名验证失败'
      )
    }

    return isValid
  } catch (error) {
    logger.error(error, '验证回调签名异常')
    return false
  }
}

/**
 * 解密回调通知资源数据
 * 算法：AES-256-GCM
 *
 * @param ciphertext 密文
 * @param associatedData 附加数据
 * @param nonce 随机串
 * @returns 解密后的数据
 */
export function decryptNotificationResource(
  ciphertext: string,
  associatedData: string,
  nonce: string
): NotificationResource {
  try {
    checkWeChatPayConfig()

    const sdk = getWxPaySDK()

    // 使用 SDK 解密 (decipher_gcm 直接返回解密后的数据，不是 Output 包装)
    const result = sdk.decipher_gcm(ciphertext, associatedData, nonce) as NotificationResource

    logger.info(
      {
        out_trade_no: result?.out_trade_no,
        trade_state: result?.trade_state,
      },
      '解密回调数据成功'
    )

    return result
  } catch (error) {
    logger.error(error, '解密回调数据失败')
    throw new Error('解密回调数据失败')
  }
}
