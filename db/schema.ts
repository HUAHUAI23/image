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
 * 充值状态（仅 category=recharge 时使用）
 * - pending: 待支付（用户发起充值，等待支付）
 * - processing: 处理中（支付平台回调处理中）
 * - success: 支付成功（已到账）
 * - failed: 支付失败
 * - refunded: 已退款
 */
export const rechargeStatusEnum = pgEnum('recharge_status', [
  'pending',
  'processing',
  'success',
  'failed',
  'refunded',
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

    // 支付信息
    paymentMethod: paymentMethodEnum('payment_method').default('balance').notNull(),
    externalOrderId: text('external_order_id'), // 第三方支付订单号（微信/Stripe/支付宝）
    rechargeStatus: rechargeStatusEnum('recharge_status'), // 充值状态（仅 recharge 时有效）

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
