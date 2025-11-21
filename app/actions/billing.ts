'use server'

import { desc,eq } from 'drizzle-orm'

import { db } from '@/db'
import { accounts, transactions } from '@/db/schema'
import { getSession } from '@/lib/auth'

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
        where: eq(accounts.userId, session.userId)
    })

    return account ? account.balance : 0
}

/**
 * Get user transaction history
 *
 * @returns List of transactions with amounts in cents (分) - database raw values
 *
 * Note: Frontend should convert to yuan (元) using fenToYuan()
 */
export async function getTransactionsAction() {
    const session = await getSession()
    if (!session) return []

    const account = await db.query.accounts.findFirst({
        where: eq(accounts.userId, session.userId)
    })

    if (!account) return []

    return await db.query.transactions.findMany({
        where: eq(transactions.accountId, account.id),
        orderBy: [desc(transactions.createdAt)]
    })
}