import { eq, sql } from 'drizzle-orm'
import type { queueAsPromised } from 'fastq'
import fastq from 'fastq'

import { db } from '@/db'
import { accounts, promptTemplates,tasks, transactions } from '@/db/schema'
import { generateImagesDetailed } from '@/lib/image-generation'
import { logger as baseLogger } from '@/lib/logger'
import { uploadToTOS } from '@/lib/tos'

const logger = baseLogger.child({ module: 'lib/queue' })

// ==================== Types ====================

type Task = {
  id: number
  type: 'text_to_image' | 'image_to_image'
}

type TaskRecord = {
  id: number
  accountId: number
  userId: number
  name: string
  type: 'text_to_image' | 'image_to_image'
  status: string
  userPrompt: string | null
  templatePromptId: number | null
  originalImageUrl: string | null
  imageNumber: number
  priceUnit: 'per_image' | 'per_token'
}

type ImageGenerationResult = {
  successUrls: string[]
  successCount: number
  totalRequested: number
  failures: Array<{ index: number; url?: string; error: string }>
}

type ImageUploadResult = {
  uploadedUrls: string[]
  uploadErrors: Array<{ index: number; url: string; error: string }>
}

// ==================== Configuration ====================

/**
 * Heartbeat interval for long-running tasks (in milliseconds)
 * Tasks will update their updated_at timestamp every 5 minutes to indicate they're still processing
 */
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

// ==================== Task Validation ====================

/**
 * Validate and lock task using SELECT FOR UPDATE
 * This ensures the task is in processing state and prevents concurrent processing
 */
async function validateAndLockTask(taskId: number): Promise<TaskRecord> {
  const result = await db.transaction(async (tx) => {
    // Use SELECT FOR UPDATE to lock the row and prevent concurrent processing
    // Join with accounts table to get userId
    const result = await tx.execute<TaskRecord>(sql`
      SELECT t.id, t.account_id as "accountId", a.user_id as "userId",
             t.name, t.type, t.status,
             t.user_prompt as "userPrompt", t.template_prompt_id as "templatePromptId",
             t.original_image_url as "originalImageUrl", t.image_number as "imageNumber",
             t.price_unit as "priceUnit"
      FROM tasks t
      INNER JOIN accounts a ON t.account_id = a.id
      WHERE t.id = ${taskId} AND t.status = 'processing'
      FOR UPDATE OF t NOWAIT
    `)

    const taskRecord = result.rows?.[0]

    if (!taskRecord) {
      throw new Error(`Task ${taskId} not found or not in processing state`)
    }

    // Validate userPrompt exists
    if (!taskRecord.userPrompt) {
      throw new Error('User prompt is required for image generation')
    }

    return taskRecord
  })

  return result
}

/**
 * Update task heartbeat to indicate it's still processing
 */
async function updateTaskHeartbeat(taskId: number) {
  await db
    .update(tasks)
    .set({ updatedAt: new Date() })
    .where(eq(tasks.id, taskId))
  logger.debug(`Updated heartbeat for task ${taskId}`)
}

/**
 * Start heartbeat timer for long-running tasks
 */
function startHeartbeat(taskId: number): NodeJS.Timeout {
  return setInterval(() => {
    updateTaskHeartbeat(taskId).catch((error) => {
      logger.error(error, `Failed to update heartbeat for task ${taskId}`)
    })
  }, HEARTBEAT_INTERVAL_MS)
}

// ==================== Template Loading ====================

/**
 * Load prompt template content if template ID is provided
 */
async function loadTemplate(templateId: number | null): Promise<string | undefined> {
  if (!templateId) {
    return undefined
  }

  logger.info(`Loading template ${templateId}`)
  const template = await db.query.promptTemplates.findFirst({
    where: eq(promptTemplates.id, templateId),
  })

  if (template) {
    logger.info(`Template loaded: ${template.name}`)
    return template.content
  }

  logger.warn(`Template ${templateId} not found`)
  return undefined
}

// ==================== Image Generation ====================

/**
 * Generate images using the image generation service
 */
async function generateImages(
  taskRecord: TaskRecord,
  templateContent: string | undefined
): Promise<ImageGenerationResult> {
  logger.info(`Generating ${taskRecord.imageNumber} images for task ${taskRecord.id}`)

  const result = await generateImagesDetailed({
    originalImageUrl: taskRecord.originalImageUrl || undefined,
    userPrompt: taskRecord.userPrompt!,
    templatePrompt: templateContent,
    imageCount: taskRecord.imageNumber,
  })

  logger.info(
    `Generated ${result.successCount}/${result.totalRequested} images for task ${taskRecord.id}`
  )

  // If all generation failed, throw error
  if (result.successCount === 0) {
    throw new Error(`All ${result.totalRequested} images failed to generate`)
  }

  return result
}

// ==================== Image Upload ====================

/**
 * Download image from URL and return buffer
 */
async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

/**
 * Upload generated images to TOS storage
 * Path: generatedImage/{userId}/{taskId}/filename.jpg
 */
async function uploadImages(
  imageUrls: string[],
  userId: number,
  taskId: number
): Promise<ImageUploadResult> {
  const uploadedUrls: string[] = []
  const uploadErrors: Array<{ index: number; url: string; error: string }> = []

  for (let i = 0; i < imageUrls.length; i++) {
    const imageUrl = imageUrls[i]
    try {
      // Download image
      const imageBuffer = await downloadImage(imageUrl)

      // Upload to TOS with structured path: generatedImage/{userId}/{taskId}/
      const filename = `${Date.now()}-${i + 1}.png`
      const tosUrl = await uploadToTOS(imageBuffer, filename, userId, taskId, 'generatedImage')

      uploadedUrls.push(tosUrl)
      logger.info(`Uploaded image ${i + 1}/${imageUrls.length}`)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown upload error'
      logger.error(error, `Failed to upload image ${i + 1}`)
      uploadErrors.push({ index: i, url: imageUrl, error: errorMsg })
    }
  }

  return { uploadedUrls, uploadErrors }
}

// ==================== Task Status Update ====================

/**
 * Determine final task status based on success rate
 */
function determineFinalStatus(
  successCount: number,
  totalRequested: number
): 'success' | 'partial_success' | 'failed' {
  if (successCount === 0) {
    return 'failed'
  } else if (successCount < totalRequested) {
    return 'partial_success'
  } else {
    return 'success'
  }
}

// ==================== Refund Handling ====================

/**
 * Handle partial refund for failed/partial_success tasks
 * NOTE: This function must be called within a transaction context
 */
async function handlePartialRefundInTx(
  tx: any,
  taskId: number,
  accountId: number,
  priceUnit: 'per_image' | 'per_token',
  totalRequested: number,
  successCount: number
) {
  // Get original charge transaction
  const txRecord = await tx.query.transactions.findFirst({
    where: eq(transactions.taskId, taskId),
  })

  if (!txRecord || txRecord.type !== 'charge') {
    logger.warn(`No charge transaction found for task ${taskId}`)
    return
  }

  // Calculate refund amount based on pricing model
  let refundAmount = 0

  if (priceUnit === 'per_image') {
    const failureCount = totalRequested - successCount
    refundAmount = Math.round((txRecord.amount * failureCount) / totalRequested)
    logger.info(
      `Calculating refund: ${failureCount} failed / ${totalRequested} total = ${refundAmount}`
    )
  } else if (priceUnit === 'per_token') {
    logger.warn(`per_token refund not yet implemented for task ${taskId}`)
    return
  }

  if (refundAmount <= 0) {
    return
  }

  // Get account and refund balance
  const account = await tx.query.accounts.findFirst({
    where: eq(accounts.id, accountId),
  })

  if (!account) {
    logger.error(`Account ${accountId} not found`)
    return
  }

  const newBalance = account.balance + refundAmount
  await tx.update(accounts).set({ balance: newBalance }).where(eq(accounts.id, account.id))

  // Create refund transaction
  await tx.insert(transactions).values({
    accountId: account.id,
    taskId,
    amount: refundAmount,
    type: 'refund',
    balanceBefore: account.balance,
    balanceAfter: newBalance,
  })

  logger.info(`Refunded ${refundAmount} for task ${taskId}`)
}

/**
 * Handle full refund for completely failed tasks
 * NOTE: This function must be called within a transaction context
 */
async function handleFullRefundInTx(tx: any, taskId: number, accountId: number) {
  // Get original charge transaction
  const txRecord = await tx.query.transactions.findFirst({
    where: eq(transactions.taskId, taskId),
  })

  if (!txRecord || txRecord.type !== 'charge') {
    logger.warn(`No charge transaction found for task ${taskId}`)
    return
  }

  // Get account and refund balance
  const account = await tx.query.accounts.findFirst({
    where: eq(accounts.id, accountId),
  })

  if (!account) {
    logger.error(`Account ${accountId} not found`)
    return
  }

  const newBalance = account.balance + txRecord.amount
  await tx.update(accounts).set({ balance: newBalance }).where(eq(accounts.id, account.id))

  // Create refund transaction
  await tx.insert(transactions).values({
    accountId: account.id,
    taskId,
    amount: txRecord.amount,
    type: 'refund',
    balanceBefore: account.balance,
    balanceAfter: newBalance,
  })

  logger.info(`Full refund ${txRecord.amount} for task ${taskId}`)
}

// ==================== Task Failure Handling ====================

/**
 * Handle task failure: update status and issue full refund
 */
async function handleTaskFailure(task: Task, errorMsg: string) {
  logger.error(`Task ${task.id} failed: ${errorMsg}`)

  await db.transaction(async (tx) => {
    // Get task record first
    const taskRecord = await tx.query.tasks.findFirst({
      where: eq(tasks.id, task.id),
    })

    if (!taskRecord) {
      logger.error(`Task ${task.id} not found for failure handling`)
      return
    }

    // Update task status to failed
    await tx
      .update(tasks)
      .set({
        status: 'failed',
        errorDetails: { summary: errorMsg },
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, task.id))

    // Issue full refund (within same transaction)
    await handleFullRefundInTx(tx, task.id, taskRecord.accountId)
  })
}

// ==================== Main Task Processing ====================

/**
 * Process a single task
 */
async function processTask(task: Task) {
  logger.info(`Start processing task ${task.id}`)
  let heartbeatTimer: NodeJS.Timeout | null = null

  try {
    // Step 1: Validate and lock task (prevents concurrent processing)
    const taskRecord = await validateAndLockTask(task.id)

    // Step 2: Start heartbeat to prevent timeout during long processing
    heartbeatTimer = startHeartbeat(task.id)

    // Step 3: Load template if needed
    const templateContent = await loadTemplate(taskRecord.templatePromptId)

    // Step 4: Generate images
    const genResult = await generateImages(taskRecord, templateContent)

    // Step 5: Upload images to TOS with structured path
    const uploadResult = await uploadImages(genResult.successUrls, taskRecord.userId, taskRecord.id)

    // Step 6: Combine all errors (generation + upload)
    const allErrors = [...genResult.failures, ...uploadResult.uploadErrors]

    // Step 7: Determine final status
    const finalSuccessCount = uploadResult.uploadedUrls.length
    const finalStatus = determineFinalStatus(finalSuccessCount, taskRecord.imageNumber)

    logger.info(
      `Task ${task.id} completed: ${finalStatus} (${finalSuccessCount}/${taskRecord.imageNumber})`
    )

    // Step 8: Update task status and handle refund in a single transaction
    await db.transaction(async (tx) => {
      // Update task status
      const errorDetails =
        allErrors.length > 0
          ? {
              summary:
                finalStatus === 'failed'
                  ? `All images failed`
                  : `${allErrors.length} of ${uploadResult.uploadedUrls.length + allErrors.length} images failed`,
              imageErrors: allErrors,
            }
          : undefined

      await tx
        .update(tasks)
        .set({
          status: finalStatus,
          generatedImageUrls: uploadResult.uploadedUrls,
          errorDetails,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, task.id))

      // Handle refund if needed (within same transaction)
      if (finalStatus !== 'success') {
        await handlePartialRefundInTx(
          tx,
          task.id,
          taskRecord.accountId,
          taskRecord.priceUnit,
          taskRecord.imageNumber,
          finalSuccessCount
        )
      }
    })

    logger.info(`Task ${task.id} processing completed successfully`)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'

    // Special handling for lock timeout errors (task already being processed)
    if (errorMsg.includes('could not obtain lock') || errorMsg.includes('NOWAIT')) {
      logger.warn(`Task ${task.id} is already being processed by another worker, skipping`)
      return
    }

    await handleTaskFailure(task, errorMsg)
  } finally {
    // Stop heartbeat timer
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
    }
    logger.info(`Finished processing task ${task.id}`)
  }
}

// ==================== Queue Management ====================

export const queue: queueAsPromised<Task> = fastq.promise(processTask, 1)

export function addToQueue(task: Task) {
  queue.push(task)
  logger.info(`Enqueued task ${task.id} (queue length: ${queue.length()})`)
}
