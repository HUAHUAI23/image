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
export const transactionTypeEnum = pgEnum('transaction_type', ['charge', 'refund'])
export const priceUnitEnum = pgEnum('price_unit', ['per_image', 'per_token'])

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
    originalImageUrl: text('original_image_url'),
    generatedImageUrls: jsonb('generated_image_urls')
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    imageNumber: integer('image_number').notNull().default(4),
    priceUnit: priceUnitEnum('price_unit').notNull().default('per_image'), // 新增：记录该任务的计费方式
    tokenCount: integer('token_count'), // 新增：如果按 token 计费，记录使用的 token 数量
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
    taskId: integer('task_id').references(() => tasks.id),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    type: transactionTypeEnum('type').notNull(),
    balanceBefore: bigint('balance_before', { mode: 'number' }).notNull(),
    balanceAfter: bigint('balance_after', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('transaction_account_idx').on(table.accountId),
    index('transaction_task_idx').on(table.taskId),
  ]
)
