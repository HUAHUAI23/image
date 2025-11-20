'use server'

import { db } from '@/db'
import { accounts, transactions } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { getSession } from '@/lib/auth'

export async function getBalanceAction() {
    const session = await getSession()
    if (!session) return 0

    const account = await db.query.accounts.findFirst({
        where: eq(accounts.userId, session.userId)
    })

    return account ? account.balance : 0
}

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