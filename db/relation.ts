// db/relations.ts
import { relations } from 'drizzle-orm'
import { users, userIdentities, accounts, tasks, transactions } from './schema'

// ==================== Relations 定义 ====================

// 用户关系
export const usersRelations = relations(users, ({ one, many }) => ({
  identities: many(userIdentities),
  account: one(accounts, {
    fields: [users.id],
    references: [accounts.userId],
  }),
}))

// 用户身份关系
export const userIdentitiesRelations = relations(userIdentities, ({ one }) => ({
  user: one(users, {
    fields: [userIdentities.userId],
    references: [users.id],
  }),
}))

// 账户关系
export const accountsRelations = relations(accounts, ({ one, many }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
  tasks: many(tasks),
  transactions: many(transactions),
}))

// 任务关系
export const tasksRelations = relations(tasks, ({ one, many }) => ({
  account: one(accounts, {
    fields: [tasks.accountId],
    references: [accounts.id],
  }),
  transactions: many(transactions),
}))

// 交易关系
export const transactionsRelations = relations(transactions, ({ one }) => ({
  account: one(accounts, {
    fields: [transactions.accountId],
    references: [accounts.id],
  }),
  task: one(tasks, {
    fields: [transactions.taskId],
    references: [tasks.id],
  }),
}))
