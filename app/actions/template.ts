'use server'

import { db } from '@/db'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'

export async function getPromptTemplatesAction() {
    const session = await getSession()
    if (!session) redirect('/login')

    return await db.query.promptTemplates.findMany()
}
