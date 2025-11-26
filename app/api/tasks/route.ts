import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

import { db } from '@/db'
import { accounts, prices, tasks, transactions } from '@/db/schema'
import { getSession } from '@/lib/auth'
import { formatCurrency } from '@/lib/const'
import { logger as baseLogger } from '@/lib/logger'
import { uploadFileToTempTOS } from '@/lib/tos'
import {
  calculateExpectedImageCount,
  createTaskPayloadSchema,
  generationOptionsSchema,
} from '@/lib/validations/task'

const logger = baseLogger.child({ module: 'app/api/tasks' })

const parseTemplateId = (value: FormDataEntryValue | null) => {
  if (typeof value !== 'string' || value === 'none' || value.trim().length === 0) {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const parseNumberField = (value: FormDataEntryValue | null) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export async function POST(request: NextRequest) {
  const session = await getSession()

  if (!session) {
    return NextResponse.json({ success: false, message: '未登录' }, { status: 401 })
  }

  const formData = await request.formData()
  const typeValue = formData.get('type')
  const nameValue = formData.get('name')
  const userPromptValue = formData.get('userPrompt')
  const existingImageUrlsValue = formData.get('existingImageUrls') // 支持多图（逗号分隔的 URL 字符串）
  const templatePromptIdValue = parseTemplateId(formData.get('templateId'))
  const imageNumberValue = formData.get('imageNumber')
  const generationOptionsValue = formData.get('generationOptions')
  const imageCountValue = formData.get('imageCount') // 上传的图片数量

  // 解析生成选项
  let parsedGenerationOptions: any = undefined
  if (typeof generationOptionsValue === 'string' && generationOptionsValue.trim().length > 0) {
    try {
      const parsed = JSON.parse(generationOptionsValue)
      const validated = generationOptionsSchema.safeParse(parsed)
      parsedGenerationOptions = validated.success ? validated.data : undefined
    } catch (error) {
      logger.warn({ error }, 'Failed to parse generationOptions')
    }
  }

  // 解析已存在的图片 URLs（支持逗号分隔的多个 URL）
  let originalImageUrls: string[] = []
  if (typeof existingImageUrlsValue === 'string' && existingImageUrlsValue.trim().length > 0) {
    originalImageUrls = existingImageUrlsValue
      .split(',')
      .map((url) => url.trim())
      .filter((url) => url.length > 0)
  }

  // 处理多个上传的本地文件
  const imageCount = imageCountValue ? parseInt(imageCountValue as string, 10) : 0
  if (imageCount > 0) {
    try {
      for (let i = 0; i < imageCount; i++) {
        const file = formData.get(`image_${i}`) as File | null
        if (file && file.size > 0) {
          const uploadedUrl = await uploadFileToTempTOS(file, session.userId)
          originalImageUrls.push(uploadedUrl)
        }
      }
    } catch (error) {
      logger.error(error, '文件上传失败')
      return NextResponse.json({ success: false, message: '图片上传失败' }, { status: 500 })
    }
  }

  const normalizedPayload = {
    type: typeof typeValue === 'string' ? (typeValue as string) : undefined,
    name: typeof nameValue === 'string' ? (nameValue as string) : '',
    userPrompt: typeof userPromptValue === 'string' ? (userPromptValue as string) : undefined,
    templatePromptId: templatePromptIdValue,
    imageNumber: parseNumberField(imageNumberValue),
    originalImageUrls,
    generationOptions: parsedGenerationOptions,
  }

  const validation = createTaskPayloadSchema.safeParse(normalizedPayload)

  if (!validation.success) {
    const firstError = validation.error.issues[0]
    return NextResponse.json(
      { success: false, message: firstError?.message || '参数校验失败' },
      { status: 400 }
    )
  }

  const {
    type,
    name,
    userPrompt,
    templatePromptId,
    imageNumber,
    originalImageUrls: validatedUrls,
    generationOptions,
  } = validation.data

  if (type === 'text_to_image' && userPrompt.length === 0) {
    return NextResponse.json({ success: false, message: '文生图必须提供提示词' }, { status: 400 })
  }

  try {
    const result = await db.transaction(async (tx) => {
      const priceRecord = await tx.query.prices.findFirst({
        where: and(eq(prices.taskType, type), eq(prices.priceUnit, 'per_image')),
      })

      if (!priceRecord) {
        return {
          success: false,
          status: 500,
          message: '价格配置未找到，请联系管理员配置 per_image 计费方式',
        } as const
      }

      const pricePerImage = priceRecord.price

      // 计算预期生成的图片数量（用于预付费）
      const expectedImageCount = calculateExpectedImageCount(imageNumber, generationOptions)
      const totalCost = pricePerImage * expectedImageCount

      const hasMultipleImages = validatedUrls.length > 1
      logger.info(
        `[Task] Creating task: ${imageNumber} batches, expected ${expectedImageCount} images, multi-image: ${hasMultipleImages} (${pricePerImage}/image) = ${totalCost} total`
      )

      const accountRecord = await tx.query.accounts.findFirst({
        where: eq(accounts.userId, session.userId),
      })

      if (!accountRecord) {
        return { success: false, status: 404, message: '账户未找到' } as const
      }

      if (accountRecord.balance < totalCost) {
        return {
          success: false,
          status: 402,
          message: `余额不足，需要 ${formatCurrency(totalCost)}，当前余额 ${formatCurrency(accountRecord.balance)}`,
        } as const
      }

      const [newTask] = await tx
        .insert(tasks)
        .values({
          accountId: accountRecord.id,
          name,
          type,
          status: 'pending',
          templatePromptId,
          userPrompt: userPrompt.length > 0 ? userPrompt : null,
          originalImageUrls: validatedUrls,
          imageNumber,
          priceUnit: 'per_image',
          generationOptions: generationOptions || {
            size: '2K',
            sequentialImageGeneration: 'disabled',
            watermark: false,
            optimizePromptOptions: { mode: 'standard' },
          },
          expectedImageCount,
          actualImageCount: 0,
        })
        .returning()

      const newBalance = accountRecord.balance - totalCost

      await tx
        .update(accounts)
        .set({ balance: newBalance })
        .where(eq(accounts.id, accountRecord.id))

      await tx.insert(transactions).values({
        accountId: accountRecord.id,
        taskId: newTask.id,
        category: 'task_charge',
        amount: totalCost,
        paymentMethod: 'balance',
        balanceBefore: accountRecord.balance,
        balanceAfter: newBalance,
        metadata: {
          description: `任务 ${name} 预付费`,
          expectedCount: expectedImageCount,
        },
      })

      logger.info(
        `[Task] Task ${newTask.id} created, charged ${totalCost} (expected ${expectedImageCount} images × ${pricePerImage}), balance: ${accountRecord.balance} → ${newBalance}`
      )

      return { success: true, status: 201, taskId: newTask.id } as const
    })

    if (!result.success) {
      return NextResponse.json(
        { success: false, message: result.message },
        { status: result.status }
      )
    }

    return NextResponse.json({ success: true, taskId: result.taskId }, { status: 201 })
  } catch (error: any) {
    logger.error(error, '[Task] Create task failed')
    return NextResponse.json(
      { success: false, message: error?.message || '创建任务失败' },
      { status: 500 }
    )
  }
}
