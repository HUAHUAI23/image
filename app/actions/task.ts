'use server'

import { desc, eq } from 'drizzle-orm'

import { db } from '@/db'
import { accounts, tasks } from '@/db/schema'
import { getSession } from '@/lib/auth'

export async function getTasksAction() {
  const session = await getSession()
  if (!session) return []

  const account = await db.query.accounts.findFirst({
    where: eq(accounts.userId, session.userId),
  })

  if (!account) return []

  return await db.query.tasks.findMany({
    where: eq(tasks.accountId, account.id),
    orderBy: [desc(tasks.createdAt)],
  })
}

export async function getPricesAction() {
  const session = await getSession()
  if (!session) return []

  return await db.query.prices.findMany()
}
