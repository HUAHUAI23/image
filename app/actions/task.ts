'use server'

import { z } from 'zod'
import { db } from '@/db'
import { tasks, accounts, transactions, prices } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { uploadFileToTOS } from '@/lib/tos'
import { logger as baseLogger } from '@/lib/logger'
const logger = baseLogger.child({ module: 'app/actions/task' })

const createTaskSchema = z.object({
  type: z.enum(['text_to_image', 'image_to_image'], {
    message: '请选择任务类型',
  }),
  name: z.string().min(1, '任务名称不能为空').max(255, '任务名称过长'),
  userPrompt: z.string().optional(),
  templatePromptId: z.number().nullable().optional(),
  imageNumber: z.number().min(1, '图片数量至少为1').max(200, '图片数量不能超过200').default(4),
  existingImageUrl: z.string().nullable().optional(),
})

export async function createTaskAction(prevState: any, formData: FormData) {
  const session = await getSession()
  if (!session) redirect('/login')

  // Extract and parse form data
  const rawData = {
    type: formData.get('type'),
    name: formData.get('name'),
    userPrompt: formData.get('userPrompt') || undefined,
    templatePromptId:
      formData.get('templateId') && formData.get('templateId') !== 'none'
        ? parseInt(formData.get('templateId') as string)
        : null,
    imageNumber: parseInt(formData.get('imageNumber') as string) || 4,
    existingImageUrl: formData.get('existingImageUrl') as string | null,
  }

  const file = formData.get('image') as File | null

  // Validate with schema
  const validation = createTaskSchema.safeParse(rawData)

  if (!validation.success) {
    const firstError = validation.error.issues[0]
    return { message: firstError.message }
  }

  const { type, name, userPrompt, templatePromptId, imageNumber, existingImageUrl } =
    validation.data

  // Upload image to TOS if not already uploaded
  let originalImageUrl = existingImageUrl || ''

  if (!originalImageUrl && file && file.size > 0) {
    try {
      originalImageUrl = await uploadFileToTOS(file, name, 'originalImage')
    } catch (e) {
      logger.error(e, 'File upload failed')
      return { message: '图片上传失败' }
    }
  }

  // Business logic validation
  if (type === 'image_to_image' && !originalImageUrl) {
    return { message: '图生图必须上传原始图片' }
  }

  if (type === 'text_to_image' && !userPrompt) {
    return { message: '文生图必须提供提示词' }
  }

  try {
    return await db.transaction(async (tx) => {
      // Get price
      const priceRecord = await tx.query.prices.findFirst({
        where: eq(prices.taskType, type),
      })

      const cost = priceRecord ? priceRecord.price : 10 // Default 10 if not set

      // Check balance
      const account = await tx.query.accounts.findFirst({
        where: eq(accounts.userId, session.userId),
      })

      if (!account) throw new Error('Account not found')

      if (account.balance < cost) {
        return { message: '余额不足，请充值' }
      }

      // Create Task
      const [newTask] = await tx
        .insert(tasks)
        .values({
          accountId: account.id,
          name: name.trim(),
          type,
          status: 'pending',
          templatePromptId: templatePromptId ?? null,
          userPrompt: userPrompt || null,
          originalImageUrl: originalImageUrl || null,
          imageNumber,
        })
        .returning()

      // Deduct Balance
      const newBalance = account.balance - cost
      await tx.update(accounts).set({ balance: newBalance }).where(eq(accounts.id, account.id))

      // Create Transaction
      await tx.insert(transactions).values({
        accountId: account.id,
        taskId: newTask.id,
        amount: cost,
        type: 'charge',
        balanceBefore: account.balance,
        balanceAfter: newBalance,
      })

      return { success: true, taskId: newTask.id }
    })
  } catch (error: any) {
    console.error('[Task] Create task failed:', error)
    return { message: error.message || '创建任务失败' }
  }
}

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
