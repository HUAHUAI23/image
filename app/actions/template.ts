'use server'

import { db } from '@/db'

export async function getPromptTemplatesAction() {
    return await db.query.promptTemplates.findMany()
}
