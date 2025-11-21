import { Cron } from 'croner'
import { sql } from 'drizzle-orm'

import { db } from '@/db'
import { logger as baseLogger } from '@/lib/logger'

import { addToQueue } from './queue'

const logger = baseLogger.child({ module: 'lib/cron' })

// ==================== Configuration ====================

/**
 * Cron execution interval (every 5 seconds)
 */
const CRON_INTERVAL = '*/5 * * * * *'

/**
 * Maximum number of pending tasks to process in one cycle
 */
const BATCH_SIZE = 10

/**
 * Task timeout in minutes
 * If a task stays in 'processing' status longer than this, it will be reset to 'pending'
 */
const TASK_TIMEOUT_MINUTES = 30

// ==================== Task Types ====================

type TaskRow = {
  id: number
  type: 'text_to_image' | 'image_to_image'
  status: string
  updated_at: Date
}

// ==================== Task Processing ====================

/**
 * Fetch and mark pending tasks as processing using SELECT FOR UPDATE SKIP LOCKED
 * This prevents race conditions when multiple cron instances run simultaneously
 */
async function fetchAndMarkPendingTasks(): Promise<TaskRow[]> {
  const result = await db.transaction(async (tx) => {
    const { rows } = await tx.execute<TaskRow>(sql`
      UPDATE tasks
      SET status = 'processing', updated_at = NOW()
      WHERE id IN (
        SELECT id FROM tasks
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, type, status, updated_at
    `)
    return rows || []
  })

  if (result.length > 0) {
    logger.info(`Marked ${result.length} pending tasks as processing`)
  }

  return result
}

/**
 * Reset timed-out tasks from 'processing' back to 'pending'
 * This recovers tasks that got stuck due to worker crashes or long processing times
 */
async function resetTimedOutTasks(): Promise<number> {
  const result = await db.transaction(async (tx) => {
    const { rows } = await tx.execute<{ id: number }>(sql`
      UPDATE tasks
      SET status = 'pending', updated_at = NOW()
      WHERE id IN (
        SELECT id FROM tasks
        WHERE status = 'processing'
          AND updated_at < NOW() - INTERVAL '${sql.raw(TASK_TIMEOUT_MINUTES.toString())} minutes'
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    `)
    return rows || []
  })

  if (result.length > 0) {
    logger.warn(`Reset ${result.length} timed-out tasks to pending`)
    result.forEach((task) => {
      logger.warn(`Task ${task.id} timed out after ${TASK_TIMEOUT_MINUTES} minutes`)
    })
  }

  return result.length
}

/**
 * Enqueue tasks to the processing queue
 */
function enqueueTasks(tasks: TaskRow[]) {
  tasks.forEach((task) => {
    addToQueue({ id: task.id, type: task.type })
  })
  logger.info(`Enqueued ${tasks.length} tasks`)
}

// ==================== Cron Job Management ====================

let cronJob: Cron | null = null

/**
 * Main cron job execution logic
 */
async function executeCronJob() {
  try {
    // Step 1: Reset timed-out tasks (recovery mechanism)
    await resetTimedOutTasks()

    // Step 2: Fetch and mark pending tasks
    const pendingTasks = await fetchAndMarkPendingTasks()

    // Step 3: Enqueue tasks for processing
    if (pendingTasks.length > 0) {
      enqueueTasks(pendingTasks)
    }
  } catch (error) {
    logger.error(error, 'Cron job execution error')
  }
}

/**
 * Initialize the cron worker
 * This function is idempotent - calling it multiple times has no effect
 */
export function initCron() {
  // Prevent multiple initializations
  if (cronJob) {
    logger.info('Cron worker already initialized, skipping')
    return
  }

  logger.info('Initializing cron worker...')
  logger.info(`  - Interval: every ${CRON_INTERVAL}`)
  logger.info(`  - Batch size: ${BATCH_SIZE} tasks`)
  logger.info(`  - Timeout: ${TASK_TIMEOUT_MINUTES} minutes`)

  cronJob = new Cron(CRON_INTERVAL, executeCronJob)

  logger.info('Cron worker initialized successfully')
}

/**
 * Stop the cron worker (useful for testing or graceful shutdown)
 */
export function stopCron() {
  if (cronJob) {
    cronJob.stop()
    cronJob = null
    logger.info('Cron worker stopped')
  }
}