import fastq from 'fastq'
import type { queueAsPromised } from 'fastq'
import { db } from '@/db'
import { tasks, accounts, transactions, promptTemplates } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { generateImagesDetailed } from '@/lib/image-generation'
import { uploadToTOS } from '@/lib/tos'
import { logger as baseLogger } from '@/lib/logger'
const logger = baseLogger.child({ module: 'lib/queue' })
type Task = {
  id: number
  type: 'text_to_image' | 'image_to_image'
}

// Note: We don't use an in-memory Set for tracking enqueued tasks
// because it's not reliable across multiple instances.
// Instead, we rely on the database 'status' field as the source of truth.

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
 * Handle partial refund for failed/partial_success tasks
 */
async function handlePartialRefund(
  taskId: number,
  accountId: number,
  totalRequested: number,
  successCount: number
) {
  await db.transaction(async (tx) => {
    // Get original charge transaction
    const txRecord = await tx.query.transactions.findFirst({
      where: eq(transactions.taskId, taskId),
    })

    if (!txRecord || txRecord.type !== 'charge') {
      logger.warn(`No charge transaction found for task ${taskId}`)
      return
    }

    // Calculate refund amount based on failure rate
    const failureCount = totalRequested - successCount
    const refundAmount = Math.round((txRecord.amount * failureCount) / totalRequested)

    if (refundAmount <= 0) {
      logger.warn(`No refund needed for task ${taskId}`)
      return
    }

    // Get account
    const account = await tx.query.accounts.findFirst({
      where: eq(accounts.id, accountId),
    })

    if (!account) {
      logger.error(`Account ${accountId} not found`)
      return
    }

    // Refund balance
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

    logger.info(
      `[Queue] Refunded ${refundAmount} for task ${taskId} (${failureCount}/${totalRequested} images failed)`
    )
  })
}

/**
 * Process a single task
 */
async function processTask(task: Task) {
  logger.info(`Start processing task ${task.id}`)

  try {
    // Fetch task details
    const taskRecord = await db.query.tasks.findFirst({
      where: eq(tasks.id, task.id),
    })

    if (!taskRecord) {
      throw new Error(`Task ${task.id} not found`)
    }

    // Verify task is in processing state (should be set by cron)
    if (taskRecord.status !== 'processing') {
      logger.warn(`Task ${task.id} is not in processing state, skipping`)
      return
    }

    // Validate userPrompt exists
    if (!taskRecord.userPrompt) {
      throw new Error('User prompt is required for image generation')
    }

    // Load template content if templatePromptId is provided
    let templateContent: string | undefined
    if (taskRecord.templatePromptId) {
      logger.info(`Loading template ${taskRecord.templatePromptId} for task ${task.id}`)
      const template = await db.query.promptTemplates.findFirst({
        where: eq(promptTemplates.id, taskRecord.templatePromptId),
      })
      if (template) {
        templateContent = template.content
        logger.info(`Template loaded: ${template.name}`)
      } else {
        logger.warn(`Template ${taskRecord.templatePromptId} not found, using userPrompt only`)
      }
    }

    // Image Generation with detailed error tracking
    logger.info(`Generating ${taskRecord.imageNumber} images for task ${task.id}`)

    // Generate images with detailed result
    const genResult = await generateImagesDetailed({
      originalImageUrl: taskRecord.originalImageUrl || undefined,
      userPrompt: taskRecord.userPrompt,
      templatePrompt: templateContent,
      imageCount: taskRecord.imageNumber,
    })

    logger.info(
      `[Queue] Generated ${genResult.successCount}/${genResult.totalRequested} images successfully`
    )

    // If all generation failed, throw error
    if (genResult.successCount === 0) {
      const errorSummary = `All ${genResult.totalRequested} images failed to generate`
      throw new Error(errorSummary)
    }

    // Track upload results and errors
    const uploadedImageUrls: string[] = []
    const uploadErrors: Array<{ index: number; url: string; error: string }> = []

    // Upload each successfully generated image to TOS
    for (let i = 0; i < genResult.successUrls.length; i++) {
      const imageUrl = genResult.successUrls[i]
      try {
        // Download image
        const imageBuffer = await downloadImage(imageUrl)

        // Upload to TOS
        const filename = `${Date.now()}-${i + 1}.png`
        const tosUrl = await uploadToTOS(imageBuffer, filename, taskRecord.name, 'generatedImage')

        uploadedImageUrls.push(tosUrl)
        logger.info(`Uploaded image ${i + 1}/${genResult.successUrls.length} to TOS`)
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown upload error'
        logger.error(error, `Failed to upload image ${i + 1}`)
        uploadErrors.push({ index: i, url: imageUrl, error: errorMsg })
      }
    }

    // Combine all errors (generation + upload)
    const allErrors: Array<{ index: number; url?: string; error: string }> = [
      ...genResult.failures,
      ...uploadErrors,
    ]

    // Determine final status based on success rate
    const totalRequested = taskRecord.imageNumber
    const finalSuccessCount = uploadedImageUrls.length
    let finalStatus: 'success' | 'partial_success' | 'failed'

    if (finalSuccessCount === 0) {
      // All failed
      finalStatus = 'failed'
    } else if (finalSuccessCount < totalRequested) {
      // Some succeeded, some failed
      finalStatus = 'partial_success'
    } else {
      // All succeeded
      finalStatus = 'success'
    }

    logger.info(
      `Task ${task.id} final status: ${finalStatus} (${finalSuccessCount}/${totalRequested} images)`
    )

    // Prepare error details
    const errorDetails = {
      summary:
        finalStatus === 'failed'
          ? `All ${totalRequested} images failed`
          : `${totalRequested - finalSuccessCount} of ${totalRequested} images failed`,
      imageErrors: allErrors.length > 0 ? allErrors : undefined,
    }

    // Update task with final status
    await db
      .update(tasks)
      .set({
        status: finalStatus,
        generatedImageUrls: uploadedImageUrls,
        errorDetails: allErrors.length > 0 ? errorDetails : undefined,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, task.id))

    logger.info(`Task ${task.id} completed with status: ${finalStatus}`)

    // Handle refund for partial success or failed
    if (finalStatus !== 'success') {
      await handlePartialRefund(task.id, taskRecord.accountId, totalRequested, finalSuccessCount)
    }
  } catch (error) {
    console.error(`[Queue] Task ${task.id} failed:`, error)

    const errorMsg = error instanceof Error ? error.message : 'Unknown error'

    // Handle failure: update status and refund
    await db.transaction(async (tx) => {
      // Update task status to failed
      await tx
        .update(tasks)
        .set({
          status: 'failed',
          errorDetails: {
            summary: errorMsg,
          },
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, task.id))

      // Refund user balance
      const taskRecord = await tx.query.tasks.findFirst({
        where: eq(tasks.id, task.id),
      })

      if (taskRecord) {
        const txRecord = await tx.query.transactions.findFirst({
          where: eq(transactions.taskId, task.id),
        })

        if (txRecord && txRecord.type === 'charge') {
          const account = await tx.query.accounts.findFirst({
            where: eq(accounts.id, taskRecord.accountId),
          })

          if (account) {
            const newBalance = account.balance + txRecord.amount
            await tx
              .update(accounts)
              .set({ balance: newBalance })
              .where(eq(accounts.id, account.id))

            await tx.insert(transactions).values({
              accountId: account.id,
              taskId: task.id,
              amount: txRecord.amount,
              type: 'refund',
              balanceBefore: account.balance,
              balanceAfter: newBalance,
            })

            logger.info(`Refunded task ${task.id}`)
          }
        }
      }
    })
  } finally {
    // Task processing complete
    logger.info(`Finished processing task ${task.id}`)
  }
}

export const queue: queueAsPromised<Task> = fastq.promise(processTask, 1)

export function addToQueue(task: Task) {
  // Simply add to queue - no need for in-memory deduplication
  // The database status field is the source of truth
  queue.push(task)
  logger.info(`Enqueued task ${task.id}`)
}
