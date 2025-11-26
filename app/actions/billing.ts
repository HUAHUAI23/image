'use server'

import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'

import { db } from '@/db'
import { accounts, transactions } from '@/db/schema'
import { getSession } from '@/lib/auth'

/**
 * Billing summary data
 */
export interface BillingSummary {
  totalConsumption: number // Total consumption in cents (分): task_charge + analysis_charge - task_refund
  totalRecharge: number // Total recharge in cents (分): successful recharges only
}

/**
 * Get billing summary for a date range
 *
 * @param startDate - Optional start date (ISO string)
 * @param endDate - Optional end date (ISO string)
 * @returns Billing summary with amounts in cents (分) - database raw values
 *
 * Note: Frontend should convert to yuan (元) using fenToYuan()
 */
export async function getBillingSummaryAction(
  startDate?: string,
  endDate?: string
): Promise<BillingSummary> {
  const session = await getSession()
  if (!session) return { totalConsumption: 0, totalRecharge: 0 }

  const account = await db.query.accounts.findFirst({
    where: eq(accounts.userId, session.userId),
  })

  if (!account) return { totalConsumption: 0, totalRecharge: 0 }

  const conditions = [eq(transactions.accountId, account.id)]

  if (startDate) {
    conditions.push(gte(transactions.createdAt, new Date(startDate)))
  }
  if (endDate) {
    conditions.push(lte(transactions.createdAt, new Date(endDate)))
  }

  // Query all relevant transactions
  const result = await db
    .select({
      category: transactions.category,
      rechargeStatus: transactions.rechargeStatus,
      totalAmount: sql<number>`SUM(${transactions.amount})`.as('total_amount'),
    })
    .from(transactions)
    .where(
      and(
        ...conditions,
        sql`${transactions.category} IN ('task_charge', 'analysis_charge', 'task_refund', 'recharge')`
      )
    )
    .groupBy(transactions.category, transactions.rechargeStatus)
    .execute()

  // Calculate totals
  let totalConsumption = 0
  let totalRecharge = 0

  result.forEach((row) => {
    const amount = Number(row.totalAmount) // Ensure numeric type from SQL SUM
    if (row.category === 'task_charge' || row.category === 'analysis_charge') {
      totalConsumption += amount
    } else if (row.category === 'task_refund') {
      totalConsumption -= amount
    } else if (row.category === 'recharge' && row.rechargeStatus === 'success') {
      totalRecharge += amount
    }
  })

  return { totalConsumption, totalRecharge }
}

/**
 * Get user account balance
 *
 * @returns Balance in cents (分) - database raw value
 *
 * Note: Frontend should convert to yuan (元) using fenToYuan()
 */
export async function getBalanceAction() {
  const session = await getSession()
  if (!session) return 0

  const account = await db.query.accounts.findFirst({
    where: eq(accounts.userId, session.userId),
  })

  return account ? account.balance : 0
}

/**
 * Get user transaction history with optional date range filter
 *
 * @param startDate - Optional start date (ISO string)
 * @param endDate - Optional end date (ISO string)
 * @returns List of transactions with amounts in cents (分) - database raw values
 *
 * Note: Frontend should convert to yuan (元) using fenToYuan()
 */
export async function getTransactionsAction(startDate?: string, endDate?: string) {
  const session = await getSession()
  if (!session) return []

  const account = await db.query.accounts.findFirst({
    where: eq(accounts.userId, session.userId),
  })

  if (!account) return []

  const conditions = [eq(transactions.accountId, account.id)]

  if (startDate) {
    conditions.push(gte(transactions.createdAt, new Date(startDate)))
  }
  if (endDate) {
    conditions.push(lte(transactions.createdAt, new Date(endDate)))
  }

  return await db.query.transactions.findMany({
    where: and(...conditions),
    orderBy: [desc(transactions.createdAt)],
  })
}

/**
 * Analysis data point
 */
export interface AnalysisDataPoint {
  date: string // YYYY-MM-DD
  amount: number // Amount in cents (分)
}

/**
 * Get consumption analysis (all charges minus refunds) grouped by date
 *
 * @param startDate - Start date (ISO string)
 * @param endDate - End date (ISO string)
 * @returns Daily consumption data in cents (分)
 *
 * Note: Frontend should convert to yuan (元) using fenToYuan()
 */
export async function getConsumptionAnalysisAction(
  startDate: string,
  endDate: string
): Promise<AnalysisDataPoint[]> {
  const session = await getSession()
  if (!session) return []

  const account = await db.query.accounts.findFirst({
    where: eq(accounts.userId, session.userId),
  })

  if (!account) return []

  // Query for task_charge, analysis_charge and task_refund transactions
  const result = await db
    .select({
      date: sql<string>`DATE(${transactions.createdAt})`.as('date'),
      category: transactions.category,
      totalAmount: sql<number>`SUM(${transactions.amount})`.as('total_amount'),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, account.id),
        sql`${transactions.category} IN ('task_charge', 'analysis_charge', 'task_refund')`,
        gte(transactions.createdAt, new Date(startDate)),
        lte(transactions.createdAt, new Date(endDate))
      )
    )
    .groupBy(sql`DATE(${transactions.createdAt})`, transactions.category)
    .execute()

  // Aggregate by date: charges (task + analysis) - refunds
  const dailyMap = new Map<string, number>()

  result.forEach((row) => {
    const current = dailyMap.get(row.date) || 0
    const amount = Number(row.totalAmount) // Ensure numeric type from SQL SUM
    if (row.category === 'task_charge' || row.category === 'analysis_charge') {
      dailyMap.set(row.date, current + amount)
    } else if (row.category === 'task_refund') {
      dailyMap.set(row.date, current - amount)
    }
  })

  // Convert to array and sort by date
  return Array.from(dailyMap.entries())
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Get recharge analysis (successful recharges only) grouped by date
 *
 * @param startDate - Start date (ISO string)
 * @param endDate - End date (ISO string)
 * @returns Daily recharge data in cents (分)
 *
 * Note: Frontend should convert to yuan (元) using fenToYuan()
 */
export async function getRechargeAnalysisAction(
  startDate: string,
  endDate: string
): Promise<AnalysisDataPoint[]> {
  const session = await getSession()
  if (!session) return []

  const account = await db.query.accounts.findFirst({
    where: eq(accounts.userId, session.userId),
  })

  if (!account) return []

  // Query for successful recharge transactions
  const result = await db
    .select({
      date: sql<string>`DATE(${transactions.createdAt})`.as('date'),
      totalAmount: sql<number>`SUM(${transactions.amount})`.as('total_amount'),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, account.id),
        eq(transactions.category, 'recharge'),
        sql`${transactions.rechargeStatus} = 'success'`,
        gte(transactions.createdAt, new Date(startDate)),
        lte(transactions.createdAt, new Date(endDate))
      )
    )
    .groupBy(sql`DATE(${transactions.createdAt})`)
    .execute()

  return result
    .map((row) => ({ date: row.date, amount: row.totalAmount }))
    .sort((a, b) => a.date.localeCompare(b.date))
}