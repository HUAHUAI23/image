/**
 * 微信支付参数校验
 */

import { z } from 'zod'

/**
 * 创建充值订单参数校验
 */
export const createRechargeOrderSchema = z.object({
  amount: z
    .number()
    .min(1, '充值金额不能少于1元')
    .max(100000, '充值金额不能超过100000元')
    .int('充值金额必须为整数'),
})

export type CreateRechargeOrderInput = z.infer<typeof createRechargeOrderSchema>

/**
 * 查询订单参数校验
 */
export const queryOrderSchema = z.object({
  outTradeNo: z.string().min(1, '订单号不能为空'),
})

export type QueryOrderInput = z.infer<typeof queryOrderSchema>

/**
 * 关闭订单参数校验
 */
export const closeOrderSchema = z.object({
  outTradeNo: z.string().min(1, '订单号不能为空'),
})

export type CloseOrderInput = z.infer<typeof closeOrderSchema>
