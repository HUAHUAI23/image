'use server'

import { redirect } from 'next/navigation'

import { db } from '@/db'
import { getSession } from '@/lib/auth'

export async function getPromptTemplatesAction() {
    const session = await getSession()
    if (!session) redirect('/login')

    return await db.query.promptTemplates.findMany()
}
