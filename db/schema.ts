// db/schema.ts
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core'

// ==================== 枚举定义 ====================

export const authProviderEnum = pgEnum('auth_provider', ['password', 'google', 'github'])
export const taskTypeEnum = pgEnum('task_type', ['text_to_image', 'image_to_image'])
export const taskStatusEnum = pgEnum('task_status', [
  'pending',
  'processing',
  'success',
  'partial_success',
  'failed',
])
export const priceUnitEnum = pgEnum('price_unit', ['per_image', 'per_token'])

// ==================== 交易系统枚举 ====================

/**
 * 交易分类
 * - task_charge: 任务预付费（创建任务时扣费）
 * - task_refund: 任务退款（实际生成少于预期时）
 * - analysis_charge: 图片分析费用（VLM 分析）
 * - recharge: 用户充值（微信、Stripe 等）
 */
export const transactionCategoryEnum = pgEnum('transaction_category', [
  'task_charge',
  'task_refund',
  'analysis_charge',
  'recharge',
])

/**
 * 支付方式
 * - balance: 余额支付（内部扣费，用于 task 和 analysis）
 * - wechat: 微信支付
 * - stripe: Stripe 支付
 * - alipay: 支付宝
 * - manual: 人工充值（管理员操作）
 */
export const paymentMethodEnum = pgEnum('payment_method', [
  'balance',
  'wechat',
  'stripe',
  'alipay',
  'manual',
])

/**
 * 支付配置枚举
 * - wechat: 微信支付
 * - alipay: 支付宝
 * - stripe: Stripe 支付
 */
export const paymentProviderEnum = pgEnum('payment_provider', ['wechat', 'alipay', 'stripe'])

/**
 * 支付配置状态
 * - enabled: 启用
 * - disabled: 禁用
 */
export const paymentConfigStatusEnum = pgEnum('payment_config_status', ['enabled', 'disabled'])

/**
 * 充值订单状态
 * - pending: 待支付（订单已创建，等待用户支付）
 * - processing: 处理中（收到支付平台回调，正在处理）
 * - success: 支付成功（充值完成）
 * - failed: 支付失败
 * - closed: 订单关闭（超时/用户取消/管理员关闭）
 */
export const chargeOrderStatusEnum = pgEnum('charge_order_status', [
  'pending',
  'processing',
  'success',
  'failed',
  'closed',
])

// ==================== 用户相关表 ====================

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 64 }).notNull().unique(),
  avatar: text('avatar').default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdateFn(() => new Date()),
})

export const userIdentities = pgTable(
  'user_identities',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: authProviderEnum('provider').notNull(),
    providerUserId: varchar('provider_user_id', { length: 128 }).notNull(),
    metadata: jsonb('metadata')
      .$type<{
        password?: { passwordHash?: string; needReset?: boolean }
        google?: { accessToken?: string; refreshToken?: string }
        github?: { accessToken?: string; refreshToken?: string }
      }>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    isPrimary: boolean('is_primary').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    unique('uniq_provider_uid').on(table.provider, table.providerUserId),
    index('idx_user_provider').on(table.userId, table.provider),
  ]
)

// ==================== 账户表 ====================

export const accounts = pgTable('accounts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  balance: bigint('balance', { mode: 'number' }).notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdateFn(() => new Date()),
})

// ==================== 提示词模板表 ====================

export const promptTemplates = pgTable(
  'prompt_templates',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('category_idx').on(table.category)]
)

// ==================== 任务表 ====================

export const tasks = pgTable(
  'tasks',
  {
    id: serial('id').primaryKey(),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id),
    name: varchar('name', { length: 255 }).notNull().default(''), // Task name
    type: taskTypeEnum('type').notNull(),
    status: taskStatusEnum('status').notNull().default('pending'),
    vlmPrompt: text('vlm_prompt'),
    templatePromptId: integer('template_prompt_id').references(() => promptTemplates.id),
    userPrompt: text('user_prompt'),
    originalImageUrls: jsonb('original_image_urls')
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(), // 支持多图输入（单图、多图融合）
    generatedImageUrls: jsonb('generated_image_urls')
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    imageNumber: integer('image_number').notNull().default(4),
    priceUnit: priceUnitEnum('price_unit').notNull().default('per_image'), // 计费方式
    tokenCount: integer('token_count'), // 如果按 token 计费，记录使用的 token 数量
    generationOptions: jsonb('generation_options')
      .$type<{
        size?: string // 图片尺寸，如 '2K', '2048x2048' 等
        sequentialImageGeneration?: 'auto' | 'disabled' // 是否启用组图模式
        sequentialImageGenerationOptions?: {
          maxImages?: number // 组图模式下的最大图片数量 (1-15)
        }
        optimizePromptOptions?: {
          mode?: 'standard' | 'fast' // 提示词优化模式
        }
        watermark?: boolean // 是否添加水印
      }>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    expectedImageCount: integer('expected_image_count').notNull(), // 预期生成的图片数量（用于预付费计算）
    actualImageCount: integer('actual_image_count').default(0).notNull(), // 实际生成的图片数量（用于退款计算）
    errorDetails: jsonb('error_details')
      .$type<{
        summary?: string // Overall error summary
        imageErrors?: Array<{ index: number; url?: string; error: string }> // Per-image errors
      }>()
      .default(sql`'{}'::jsonb`), // Detailed error information for failed/partial tasks
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [index('account_idx').on(table.accountId), index('status_idx').on(table.status)]
)

// ==================== 价格表 ====================

export const prices = pgTable('prices', {
  id: serial('id').primaryKey(),
  taskType: taskTypeEnum('task_type').notNull().unique(),
  price: bigint('price', { mode: 'number' }).notNull(),
  priceUnit: priceUnitEnum('price_unit').notNull().default('per_image'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ==================== 支付配置表 ====================

/**
 * 支付配置表
 * 用于存储不同支付方式的配置信息（非敏感信息）
 * 敏感信息（私钥、密钥等）存储在环境变量中
 */
export const paymentConfigs = pgTable('payment_configs', {
  id: serial('id').primaryKey(),
  provider: paymentProviderEnum('provider').notNull().unique(),
  displayName: varchar('display_name', { length: 64 }).notNull(), // 显示名称，如 "微信支付"
  description: text('description'), // 描述信息
  icon: text('icon'), // 图标 URL 或 emoji，如 "💳"
  status: paymentConfigStatusEnum('status').notNull().default('enabled'), // 启用/禁用状态
  sortOrder: integer('sort_order').notNull().default(0), // 显示顺序，数字越小越靠前

  // 充值配置
  presetAmounts: jsonb('preset_amounts')
    .$type<number[]>() // 预设充值金额列表，如 [10, 50, 100, 500]
    .default(sql`'[10, 50, 100, 500]'::jsonb`)
    .notNull(),
  minAmount: integer('min_amount').notNull().default(1), // 最小充值金额(元)
  maxAmount: integer('max_amount').notNull().default(100000), // 最大充值金额(元)

  // 非敏感配置信息（JSONB）
  publicConfig: jsonb('public_config')
    .$type<{
      // 通用配置
      orderTimeoutMinutes?: number // 订单超时时间(分钟)，默认 10

      // 微信支付公开配置（不含敏感信息）
      wechat?: {
        appid?: string // 公众号/小程序 APPID（可公开）
        mchid?: string // 商户号（可公开）
      }

      // 支付宝公开配置
      alipay?: {
        appId?: string // 应用ID（可公开）
      }

      // Stripe 公开配置
      stripe?: {
        publicKey?: string // Stripe 公钥（可公开）
      }

      [key: string]: any
    }>()
    .default(sql`'{}'::jsonb`)
    .notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdateFn(() => new Date()),
})

// ==================== 充值订单表 ====================

/**
 * 充值订单表（通用设计）
 * 支持多种支付方式：微信支付、支付宝、Stripe、手工充值
 *
 * 工作流程：
 * 1. 创建 charge_order (status=pending)
 * 2. 调用支付接口获取支付凭证（二维码/支付链接等）
 * 3. 用户完成支付
 * 4. 收到支付回调/管理员确认 → 在事务中：
 *    - 更新 charge_order.status = success
 *    - 创建 transaction 记录
 *    - 更新 account 余额
 */
export const chargeOrders = pgTable(
  'charge_orders',
  {
    id: serial('id').primaryKey(),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id),

    // 金额和支付方式
    amount: bigint('amount', { mode: 'number' }).notNull(), // 充值金额（分）
    provider: paymentMethodEnum('provider').notNull(), // 支付方式: wechat/alipay/stripe/manual

    // 订单标识
    outTradeNo: text('out_trade_no').notNull().unique(), // 商户订单号（内部生成，唯一）
    externalTransactionId: text('external_transaction_id'), // 第三方支付平台交易号（微信/支付宝/Stripe）

    // 支付凭证（根据支付方式不同而不同）
    paymentCredential: jsonb('payment_credential')
      .$type<{
        // 微信支付 Native
        wechat?: {
          codeUrl?: string // 二维码链接
          prepayId?: string // 预支付ID
        }
        // 支付宝
        alipay?: {
          qrCode?: string // 二维码内容
          pageUrl?: string // 支付页面URL
        }
        // Stripe
        stripe?: {
          clientSecret?: string // Stripe 客户端密钥
          paymentIntentId?: string // PaymentIntent ID
        }
        // 手工充值（无需支付凭证）
        manual?: {
          operatorId?: number // 操作员ID
          note?: string // 备注
        }
        [key: string]: any
      }>()
      .default(sql`'{}'::jsonb`),

    // 状态
    status: chargeOrderStatusEnum('status').notNull().default('pending'),

    // 时间管理
    expireTime: timestamp('expire_time', { withTimezone: true }), // 订单过期时间（手工充值可为空）
    paidAt: timestamp('paid_at', { withTimezone: true }), // 支付完成时间

    // 关联
    transactionId: integer('transaction_id'), // 支付成功后创建的交易记录ID（避免循环引用，不设置外键）
    operatorId: integer('operator_id').references(() => users.id), // 操作员ID（手工充值时记录）

    // 元数据（存储各支付平台特定数据）
    metadata: jsonb('metadata')
      .$type<{
        description?: string // 订单描述
        ip?: string // 用户IP

        // 微信支付回调数据
        wechatCallback?: {
          transaction_id?: string
          trade_type?: string
          bank_type?: string
          success_time?: string
          payer?: { openid?: string }
          [key: string]: any
        }

        // 支付宝回调数据
        alipayCallback?: {
          trade_no?: string
          buyer_id?: string
          [key: string]: any
        }

        // Stripe 回调数据
        stripeCallback?: {
          payment_intent?: string
          charge_id?: string
          [key: string]: any
        }

        // 手工充值信息
        manualCharge?: {
          reason?: string // 充值原因
          approver?: string // 审批人
          note?: string // 备注
        }

        // 失败信息
        failureReason?: string // 失败原因
        errorCode?: string // 错误码
        errorMessage?: string // 错误消息

        [key: string]: any
      }>()
      .default(sql`'{}'::jsonb`)
      .notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index('charge_order_account_idx').on(table.accountId),
    index('charge_order_status_idx').on(table.status),
    index('charge_order_provider_idx').on(table.provider),
    index('charge_order_out_trade_no_idx').on(table.outTradeNo),
    index('charge_order_external_id_idx').on(table.externalTransactionId),
    index('charge_order_created_at_idx').on(table.createdAt),
  ]
)

// ==================== 交易表 ====================

export const transactions = pgTable(
  'transactions',
  {
    id: serial('id').primaryKey(),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id),

    // 交易分类和金额
    category: transactionCategoryEnum('category').notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),

    // 余额变动
    balanceBefore: bigint('balance_before', { mode: 'number' }).notNull(),
    balanceAfter: bigint('balance_after', { mode: 'number' }).notNull(),

    // 关联信息（根据 category 不同，可能为空）
    taskId: integer('task_id').references(() => tasks.id),
    chargeOrderId: integer('charge_order_id'), // 关联充值订单（仅 recharge 时有值，避免循环引用不设置外键）

    // 支付信息
    paymentMethod: paymentMethodEnum('payment_method').default('balance').notNull(),
    externalOrderId: text('external_order_id'), // 第三方支付订单号（微信/Stripe/支付宝），用于快速查询和对账

    // 额外信息（JSONB 存储特定类型的详情）
    metadata: jsonb('metadata')
      .$type<{
        description?: string // 交易描述
        // Task 相关
        expectedCount?: number // 预期图片数量
        actualCount?: number // 实际图片数量
        refundReason?: string // 退款原因
        // Analysis 相关
        analysisType?: string // 'vlm', 'ocr' 等
        imageUrl?: string // 分析的图片 URL
        // Recharge 相关
        paymentDetails?: {
          platform?: string
          platformOrderId?: string
          paymentTime?: string
          [key: string]: any
        }
      }>()
      .default(sql`'{}'::jsonb`)
      .notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('transaction_account_idx').on(table.accountId),
    index('transaction_task_idx').on(table.taskId),
    index('transaction_category_idx').on(table.category),
    index('transaction_external_order_idx').on(table.externalOrderId),
    index('transaction_created_at_idx').on(table.createdAt),
  ]
)
