'use server'

import { z } from 'zod'
import { db } from '@/db'
import { tasks, accounts, transactions, prices, promptTemplates } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { writeFile } from 'fs/promises'
import { join } from 'path'

const createTaskSchema = z.object({
  type: z.enum(['text_to_image', 'image_to_image']),
  userPrompt: z.string().optional(),
  // file handling is manual with FormData
})

async function saveFile(file: File): Promise<string> {
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const filename = `${Date.now()}-${file.name}`
  const path = join(process.cwd(), 'public/uploads', filename)
  await writeFile(path, buffer)
  return `/uploads/${filename}`
}

export async function createTaskAction(prevState: any, formData: FormData) {
  const session = await getSession()
  if (!session) redirect('/login')

  const type = formData.get('type') as 'text_to_image' | 'image_to_image'
  const userPrompt = formData.get('userPrompt') as string
  const templateId = formData.get('templateId') as string
  const file = formData.get('image') as File | null

  if (!type) {
    return { message: "请选择任务类型" }
  }

  let originalImageUrl = ''
  if (file && file.size > 0) {
    try {
      originalImageUrl = await saveFile(file)
    } catch (e) {
      console.error('File upload failed', e)
      return { message: "图片上传失败" }
    }
  }

  if (type === 'image_to_image' && !originalImageUrl) {
      return { message: "图生图必须上传原始图片" }
  }

  try {
    return await db.transaction(async (tx) => {
        // Get price
        const priceRecord = await tx.query.prices.findFirst({
            where: eq(prices.taskType, type)
        })

        const cost = priceRecord ? priceRecord.price : 10 // Default 10 if not set

        // Check balance
        const account = await tx.query.accounts.findFirst({
            where: eq(accounts.userId, session.userId)
        })

        if (!account) throw new Error("Account not found")

        if (account.balance < cost) {
            return { message: "余额不足，请充值" }
        }

        // Get Template Prompt
        let templatePrompt = ''
        if (templateId && templateId !== 'none') {
            const template = await tx.query.promptTemplates.findFirst({
                where: eq(promptTemplates.id, parseInt(templateId))
            })
            if (template) {
                templatePrompt = template.content
            }
        }

        // Create Task
        const [newTask] = await tx.insert(tasks).values({
            accountId: account.id,
            type,
            status: 'pending',
            userPrompt: userPrompt || '',
            templatePrompt,
            originalImageUrl: originalImageUrl || null,
        }).returning()

        // Deduct Balance
        const newBalance = account.balance - cost
        await tx.update(accounts)
            .set({ balance: newBalance })
            .where(eq(accounts.id, account.id))

        // Create Transaction
        await tx.insert(transactions).values({
            accountId: account.id,
            taskId: newTask.id,
            amount: cost,
            type: 'charge',
            balanceBefore: account.balance,
            balanceAfter: newBalance
        })

        return { success: true, taskId: newTask.id }
    })
  } catch (error: any) {
    if (error.message === "余额不足，请充值") {
        return { message: error.message }
    }
    console.error(error)
    return { message: "创建任务失败" }
  }
}

export async function getTasksAction() {
    const session = await getSession()
    if (!session) return []

    const account = await db.query.accounts.findFirst({
        where: eq(accounts.userId, session.userId)
    })

    if (!account) return []

    return await db.query.tasks.findMany({
        where: eq(tasks.accountId, account.id),
        orderBy: [desc(tasks.createdAt)]
    })
}
