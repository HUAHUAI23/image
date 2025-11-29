/**
 * 微信支付工具库
 * 基于微信支付 API v3
 * 文档：https://pay.weixin.qq.com/wiki/doc/apiv3/index.shtml
 */

import crypto from 'crypto'

import { env } from './env'
import { logger } from './logger'

// 微信支付 API 基础 URL
const WECHAT_PAY_BASE_URL = 'https://api.mch.weixin.qq.com'

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
    env.WECHAT_PAY_NOTIFY_URL
  )
}

/**
 * 生成请求签名
 * 算法：SHA256-RSA2048
 */
function generateSignature(
  method: string,
  url: string,
  timestamp: number,
  nonce: string,
  body: string
): string {
  // 构建待签名字符串
  const message = `${method}\n${url}\n${timestamp}\n${nonce}\n${body}\n`

  // 使用商户私钥签名
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(message)
  const signature = sign.sign(env.WECHAT_PAY_PRIVATE_KEY!, 'base64')

  return signature
}

/**
 * 构建 Authorization 请求头
 */
function buildAuthorizationHeader(method: string, url: string, body: string = ''): string {
  const timestamp = Math.floor(Date.now() / 1000)
  const nonce = crypto.randomBytes(16).toString('hex')
  const signature = generateSignature(method, url, timestamp, nonce, body)

  return `WECHATPAY2-SHA256-RSA2048 mchid="${env.WECHAT_PAY_MCHID!}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${env.WECHAT_PAY_SERIAL_NO!}"`
}

/**
 * 验证回调通知签名
 * 按照官方文档要求进行完整的安全验证
 */
export function verifyNotificationSignature(
  timestamp: string,
  nonce: string,
  body: string,
  signature: string,
  serialNo: string
): boolean {
  try {
    // 1. 签名探测流量检测
    if (signature.startsWith('WECHATPAY/SIGNTEST/')) {
      logger.warn({ signature }, '检测到微信支付签名探测流量')
      return false
    }

    // 2. 时间戳验证（防重放攻击）
    // 官方文档要求：允许最多5分钟的时间偏差
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
    // 官方文档要求：检查序列号是否与当前持有的平台证书序列号一致
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

    // 4. 构建验签串
    const message = `${timestamp}\n${nonce}\n${body}\n`

    // 5. 使用微信支付平台证书验签
    if (!env.WECHAT_PAY_PLATFORM_CERT) {
      logger.error('未配置微信支付平台证书')
      return false
    }

    const verify = crypto.createVerify('RSA-SHA256')
    verify.update(message)

    const isValid = verify.verify(env.WECHAT_PAY_PLATFORM_CERT, signature, 'base64')

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
 */
export function decryptNotificationResource(
  ciphertext: string,
  associatedData: string,
  nonce: string
): any {
  try {
    const key = Buffer.from(env.WECHAT_PAY_API_V3_KEY!, 'utf8')
    const nonceBuffer = Buffer.from(nonce, 'utf8')
    const associatedDataBuffer = Buffer.from(associatedData, 'utf8')
    const ciphertextBuffer = Buffer.from(ciphertext, 'base64')

    // 提取认证标签 (最后 16 字节)
    const authTag = ciphertextBuffer.slice(-16)
    const encrypted = ciphertextBuffer.slice(0, -16)

    // AES-256-GCM 解密
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonceBuffer)
    decipher.setAAD(associatedDataBuffer)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(encrypted)
    decrypted = Buffer.concat([decrypted, decipher.final()])

    const result = JSON.parse(decrypted.toString('utf8'))
    logger.info(
      {
        out_trade_no: result.out_trade_no,
        trade_state: result.trade_state,
      },
      '解密回调数据成功'
    )

    return result
  } catch (error) {
    logger.error(error, '解密回调数据失败')
    throw new Error('解密回调数据失败')
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
 * 微信支付订单信息
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
 * Native 支付下单
 */
export async function createNativePayOrder(
  params: NativePayOrderParams
): Promise<{ codeUrl: string }> {
  checkWeChatPayConfig()

  const url = '/v3/pay/transactions/native'
  const fullUrl = `${WECHAT_PAY_BASE_URL}${url}`

  const body = {
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
  }

  const bodyStr = JSON.stringify(body)
  const authorization = buildAuthorizationHeader('POST', url, bodyStr)

  try {
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: authorization,
      },
      body: bodyStr,
    })

    if (!response.ok) {
      const error = await response.json()
      logger.error(
        {
          status: response.status,
          error,
          outTradeNo: params.outTradeNo,
        },
        '微信下单失败'
      )
      throw new Error(`微信下单失败: ${error.message || '未知错误'}`)
    }

    const result = await response.json()
    logger.info(
      {
        outTradeNo: params.outTradeNo,
        codeUrl: result.code_url,
      },
      '微信下单成功'
    )

    return { codeUrl: result.code_url }
  } catch (error) {
    logger.error(error, '调用微信支付 API 失败')
    throw error
  }
}

/**
 * 查询订单（通过商户订单号）
 */
export async function queryOrderByOutTradeNo(outTradeNo: string): Promise<WeChatOrder> {
  checkWeChatPayConfig()

  const url = `/v3/pay/transactions/out-trade-no/${outTradeNo}?mchid=${env.WECHAT_PAY_MCHID!}`
  const fullUrl = `${WECHAT_PAY_BASE_URL}${url}`
  const authorization = buildAuthorizationHeader('GET', url)

  try {
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: authorization,
      },
    })

    if (!response.ok) {
      const error = await response.json()
      logger.error(
        {
          status: response.status,
          error,
          outTradeNo,
        },
        '查询订单失败'
      )
      throw new Error(`查询订单失败: ${error.message || '未知错误'}`)
    }

    const result = await response.json()
    logger.info(
      {
        outTradeNo,
        trade_state: result.trade_state,
      },
      '查询订单成功'
    )

    return result
  } catch (error) {
    logger.error(error, '查询订单异常')
    throw error
  }
}

/**
 * 关闭订单
 */
export async function closeOrder(outTradeNo: string): Promise<void> {
  checkWeChatPayConfig()

  const url = `/v3/pay/transactions/out-trade-no/${outTradeNo}/close`
  const fullUrl = `${WECHAT_PAY_BASE_URL}${url}`

  const body = {
    mchid: env.WECHAT_PAY_MCHID!,
  }

  const bodyStr = JSON.stringify(body)
  const authorization = buildAuthorizationHeader('POST', url, bodyStr)

  try {
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: authorization,
      },
      body: bodyStr,
    })

    if (!response.ok && response.status !== 204) {
      const error = await response.json()
      logger.error(
        {
          status: response.status,
          error,
          outTradeNo,
        },
        '关闭订单失败'
      )
      throw new Error(`关闭订单失败: ${error.message || '未知错误'}`)
    }

    logger.info({ outTradeNo }, '关闭订单成功')
  } catch (error) {
    logger.error(error, '关闭订单异常')
    throw error
  }
}
