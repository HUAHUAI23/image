/**
 * 支付宝支付工具库
 * 基于支付宝开放平台官方 SDK
 * 文档：https://opendocs.alipay.com/open/270/01didh
 */

import { AlipaySdk } from 'alipay-sdk'

import { env } from './env'
import { logger } from './logger'

// 支付宝 SDK 实例（懒加载）
let alipaySdkInstance: AlipaySdk | null = null

/**
 * 检查支付宝支付是否已配置
 */
function checkAlipayConfig(): void {
  if (!env.ALIPAY_APPID || !env.ALIPAY_PRIVATE_KEY || !env.ALIPAY_PUBLIC_KEY) {
    throw new Error('支付宝支付未配置，请在环境变量中设置 ALIPAY_* 相关配置')
  }
}

/**
 * 检查支付宝支付是否已启用
 */
export function isAlipayEnabled(): boolean {
  return !!(env.ALIPAY_APPID && env.ALIPAY_PRIVATE_KEY && env.ALIPAY_PUBLIC_KEY)
}

/**
 * 获取支付宝 SDK 实例（单例模式）
 */
function getAlipaySDK(): AlipaySdk {
  if (!alipaySdkInstance) {
    checkAlipayConfig()

    alipaySdkInstance = new AlipaySdk({
      appId: env.ALIPAY_APPID!,
      privateKey: env.ALIPAY_PRIVATE_KEY!,
      alipayPublicKey: env.ALIPAY_PUBLIC_KEY!,
      signType: 'RSA2', // 使用 RSA2 签名算法（推荐）
      gateway: 'https://openapi.alipay.com/gateway.do',
      // 如果使用沙箱环境，使用下面的网关
      // gateway: 'https://openapi-sandbox.dl.alipaydev.com/gateway.do',
    })

    logger.info('支付宝 SDK 初始化成功')
  }

  return alipaySdkInstance
}

/**
 * 支付宝订单信息
 */
export interface AlipayOrder {
  out_trade_no: string // 商户订单号
  trade_no?: string // 支付宝交易号
  trade_status:
    | 'WAIT_BUYER_PAY' // 交易创建，等待买家付款
    | 'TRADE_CLOSED' // 未付款交易超时关闭，或支付完成后全额退款
    | 'TRADE_SUCCESS' // 交易支付成功
    | 'TRADE_FINISHED' // 交易结束，不可退款
  total_amount: string // 订单金额（元）
  buyer_pay_amount?: string // 买家实付金额（元）
  receipt_amount?: string // 实收金额（元）
  invoice_amount?: string // 开票金额（元）
  buyer_logon_id?: string // 买家支付宝账号
  buyer_user_id?: string // 买家支付宝用户ID
  buyer_open_id?: string // 买家支付宝用户唯一标识
  send_pay_date?: string // 本次交易打款给卖家的时间
  point_amount?: string // 积分支付的金额（元）
  subject?: string // 订单标题
  body?: string // 订单描述
}

/**
 * 扫码支付下单参数
 */
export interface PrecreateOrderParams {
  outTradeNo: string // 商户订单号
  subject: string // 订单标题
  totalAmount: number // 订单金额（分）
  body?: string // 订单描述
  storeId?: string // 商户门店编号
  operatorId?: string // 商户操作员编号
  terminalId?: string // 商户机具终端编号
}

/**
 * 统一收单线下交易预创建（扫码支付下单）
 * 文档：https://opendocs.alipay.com/open/02ekfg
 *
 * @param params 下单参数
 * @returns qrCode 二维码字符串（有效期2小时）
 */
export async function precreateOrder(
  params: PrecreateOrderParams
): Promise<{ qrCode: string; outTradeNo: string }> {
  checkAlipayConfig()

  const sdk = getAlipaySDK()

  const bizContent: Record<string, any> = {
    out_trade_no: params.outTradeNo,
    total_amount: (params.totalAmount / 100).toFixed(2), // 分转元，保留两位小数
    subject: params.subject,
    product_code: 'QR_CODE_OFFLINE', // 固定值：订单码支付
  }

  // 可选参数
  if (params.body) bizContent.body = params.body
  if (params.storeId) bizContent.store_id = params.storeId
  if (params.operatorId) bizContent.operator_id = params.operatorId
  if (params.terminalId) bizContent.terminal_id = params.terminalId

  try {
    logger.info(
      {
        outTradeNo: params.outTradeNo,
        totalAmount: params.totalAmount,
        subject: params.subject,
      },
      '开始调用支付宝下单接口'
    )

    const result = await sdk.exec('alipay.trade.precreate', {
      notifyUrl: env.ALIPAY_NOTIFY_URL,
      bizContent,
    })

    // 检查返回结果
    if (result.code !== '10000') {
      logger.error(
        {
          code: result.code,
          msg: result.msg,
          subCode: result.subCode,
          subMsg: result.subMsg,
          outTradeNo: params.outTradeNo,
        },
        '支付宝下单失败'
      )
      throw new Error(`支付宝下单失败: ${result.subMsg || result.msg}`)
    }

    logger.info(
      {
        outTradeNo: params.outTradeNo,
        qrCode: result.qrCode,
      },
      '支付宝下单成功'
    )

    return {
      qrCode: result.qrCode,
      outTradeNo: result.outTradeNo,
    }
  } catch (error) {
    logger.error(error, '调用支付宝下单接口异常')
    throw error
  }
}

/**
 * 统一收单交易查询
 * 文档：https://opendocs.alipay.com/open/02ekfj
 *
 * @param outTradeNo 商户订单号
 * @returns 订单信息
 */
export async function queryOrderByOutTradeNo(outTradeNo: string): Promise<AlipayOrder> {
  checkAlipayConfig()

  const sdk = getAlipaySDK()

  try {
    logger.info(
      {
        outTradeNo,
      },
      '开始查询支付宝订单'
    )

    const result = await sdk.exec('alipay.trade.query', {
      bizContent: {
        out_trade_no: outTradeNo,
      },
    })

    // 检查返回结果
    if (result.code !== '10000') {
      logger.error(
        {
          code: result.code,
          msg: result.msg,
          subCode: result.subCode,
          subMsg: result.subMsg,
          outTradeNo,
        },
        '查询支付宝订单失败'
      )
      throw new Error(`查询订单失败: ${result.subMsg || result.msg}`)
    }

    logger.info(
      {
        outTradeNo,
        tradeStatus: result.tradeStatus,
        tradeNo: result.tradeNo,
      },
      '查询支付宝订单成功'
    )

    return {
      out_trade_no: result.outTradeNo,
      trade_no: result.tradeNo,
      trade_status: result.tradeStatus,
      total_amount: result.totalAmount,
      buyer_pay_amount: result.buyerPayAmount,
      receipt_amount: result.receiptAmount,
      invoice_amount: result.invoiceAmount,
      buyer_logon_id: result.buyerLogonId,
      buyer_user_id: result.buyerUserId,
      buyer_open_id: result.buyerOpenId,
      send_pay_date: result.sendPayDate,
      point_amount: result.pointAmount,
      subject: result.subject,
      body: result.body,
    }
  } catch (error) {
    logger.error(error, '查询支付宝订单异常')
    throw error
  }
}

/**
 * 统一收单交易撤销
 * 文档：https://opendocs.alipay.com/open/02ekfk
 *
 * 注意：
 * - 如果此订单用户支付失败，支付宝将关闭此订单，用户无法继续支付
 * - 如果此订单用户支付成功，支付宝将退还订单资金给用户，交易状态变为 TRADE_CLOSED
 * - 仅发生支付系统超时或者支付结果未知时可调用撤销接口
 *
 * @param outTradeNo 商户订单号
 * @returns retryFlag: Y需要重试, N不需要重试; action: close关闭交易无退款, refund产生了退款
 */
export async function cancelOrder(
  outTradeNo: string
): Promise<{ retryFlag: string; action: string }> {
  checkAlipayConfig()

  const sdk = getAlipaySDK()

  try {
    logger.info(
      {
        outTradeNo,
      },
      '开始撤销支付宝订单'
    )

    const result = await sdk.exec('alipay.trade.cancel', {
      bizContent: {
        out_trade_no: outTradeNo,
      },
    })

    // 检查返回结果
    if (result.code !== '10000') {
      logger.error(
        {
          code: result.code,
          msg: result.msg,
          subCode: result.subCode,
          subMsg: result.subMsg,
          outTradeNo,
        },
        '撤销支付宝订单失败'
      )
      throw new Error(`撤销订单失败: ${result.subMsg || result.msg}`)
    }

    logger.info(
      {
        outTradeNo,
        retryFlag: result.retryFlag,
        action: result.action,
      },
      '撤销支付宝订单成功'
    )

    return {
      retryFlag: result.retryFlag,
      action: result.action,
    }
  } catch (error) {
    logger.error(error, '撤销支付宝订单异常')
    throw error
  }
}

/**
 * 统一收单交易关闭
 * 文档：https://opendocs.alipay.com/open/02o6e7
 *
 * 用于交易创建后，用户在一定时间内未进行支付，可调用该接口直接将未付款的交易进行关闭。
 *
 * 注意：
 * - 只能关闭等待买家付款状态的订单
 * - 订单关闭后用户无法继续支付
 *
 * @param outTradeNo 商户订单号
 */
export async function closeOrder(outTradeNo: string): Promise<void> {
  checkAlipayConfig()

  const sdk = getAlipaySDK()

  try {
    logger.info({ outTradeNo }, '开始关闭支付宝订单')

    const result = await sdk.exec('alipay.trade.close', {
      bizContent: {
        out_trade_no: outTradeNo,
      },
    })

    // 检查返回结果
    if (result.code !== '10000') {
      const subCode = result.subCode || ''

      // 这些错误码表示订单已经不需要关闭（已关闭/不存在/已支付等）
      const ignorableErrors = [
        'ACQ.TRADE_NOT_EXIST', // 交易不存在
        'ACQ.TRADE_STATUS_ERROR', // 交易状态不合法（已支付等）
        'ACQ.REASON_TRADE_STATUS_INVALID', // 交易状态异常
        'ACQ.REASON_ILLEGAL_STATUS', // 交易状态异常
      ]

      if (ignorableErrors.includes(subCode)) {
        logger.info(
          { outTradeNo, subCode, subMsg: result.subMsg },
          '支付宝订单无需关闭（已关闭/不存在/状态不允许）'
        )
        return
      }

      logger.error(
        {
          code: result.code,
          msg: result.msg,
          subCode: result.subCode,
          subMsg: result.subMsg,
          outTradeNo,
        },
        '关闭支付宝订单失败'
      )
      throw new Error(`关闭订单失败: ${result.subMsg || result.msg}`)
    }

    logger.info(
      { outTradeNo, tradeNo: result.tradeNo },
      '关闭支付宝订单成功'
    )
  } catch (error) {
    logger.error(error, '关闭支付宝订单异常')
    throw error
  }
}

/**
 * 验证支付宝异步通知签名
 * 文档：https://opendocs.alipay.com/open/270/105902
 *
 * @param params 支付宝回调参数（完整的 POST body）
 * @returns 是否验证通过
 */
export function verifyNotificationSignature(params: Record<string, any>): boolean {
  try {
    checkAlipayConfig()

    const sdk = getAlipaySDK()

    // 使用 SDK 内置的验签方法
    const isValid = sdk.checkNotifySign(params)

    if (!isValid) {
      logger.error(
        {
          notifyId: params.notify_id,
          outTradeNo: params.out_trade_no,
        },
        '支付宝异步通知签名验证失败'
      )
    } else {
      logger.info(
        {
          notifyId: params.notify_id,
          outTradeNo: params.out_trade_no,
        },
        '支付宝异步通知签名验证成功'
      )
    }

    return isValid
  } catch (error) {
    logger.error(error, '验证支付宝签名异常')
    return false
  }
}
