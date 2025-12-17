import { Cron } from 'croner'
import { sql } from 'drizzle-orm'

import { db } from '@/db'
import { paymentMethodEnum } from '@/db/schema'
import { env } from '@/lib/env'
import { logger as baseLogger } from '@/lib/logger'

import { closeOrder as closeAlipayOrder, isAlipayEnabled } from './alipay'
import { addToQueue } from './queue'
import { closeOrder as closeWechatOrder, isWeChatPayEnabled } from './wechat-pay'

const logger = baseLogger.child({ module: 'lib/cron' })

// ==================== Task Types ====================

type TaskRow = {
  id: number
  type: 'text_to_image' | 'image_to_image'
  status: string
  updated_at: Date
}

/** Payment provider type from schema */
type PaymentProvider = (typeof paymentMethodEnum.enumValues)[number]

type ExpiredOrderRow = {
  id: number
  out_trade_no: string
  provider: PaymentProvider
  amount: number
  expire_time: Date
}

// ==================== Cron Job 1: Task Enqueue ====================

/**
 * Configuration for Task Enqueue Cron
 * Polls database for pending tasks and adds them to the processing queue
 */
const TASK_ENQUEUE_CONFIG = {
  enabled: env.CRON_TASK_ENQUEUE_ENABLED,
  interval: env.CRON_TASK_ENQUEUE_INTERVAL,
  batchSize: env.CRON_TASK_ENQUEUE_BATCH_SIZE,
}

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
        LIMIT ${TASK_ENQUEUE_CONFIG.batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, type, status, updated_at
    `)
    return rows || []
  })

  if (result.length > 0) {
    logger.info(`[TaskEnqueue] Marked ${result.length} pending tasks as processing`)
  }

  return result
}

/**
 * Enqueue tasks to the processing queue
 */
function enqueueTasks(tasks: TaskRow[]) {
  tasks.forEach((task) => {
    addToQueue({ id: task.id, type: task.type })
  })
  logger.info(`[TaskEnqueue] Enqueued ${tasks.length} tasks`)
}

/**
 * Main execution logic for Task Enqueue Cron
 */
async function executeTaskEnqueueCron() {
  try {
    const pendingTasks = await fetchAndMarkPendingTasks()

    if (pendingTasks.length > 0) {
      enqueueTasks(pendingTasks)
    }
  } catch (error) {
    logger.error(error, '[TaskEnqueue] Cron job execution error')
  }
}

// ==================== Cron Job 2: Task Timeout Recovery ====================

/**
 * Configuration for Task Timeout Recovery Cron
 * Resets tasks that have been stuck in 'processing' status for too long
 */
const TASK_TIMEOUT_CONFIG = {
  enabled: env.CRON_TASK_TIMEOUT_ENABLED,
  interval: env.CRON_TASK_TIMEOUT_INTERVAL,
  timeoutMinutes: env.CRON_TASK_TIMEOUT_MINUTES,
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
          AND updated_at < NOW() - INTERVAL '${sql.raw(TASK_TIMEOUT_CONFIG.timeoutMinutes.toString())} minutes'
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    `)
    return rows || []
  })

  if (result.length > 0) {
    logger.warn(`[TaskTimeout] Reset ${result.length} timed-out tasks to pending`)
    result.forEach((task) => {
      logger.warn(`[TaskTimeout] Task ${task.id} timed out after ${TASK_TIMEOUT_CONFIG.timeoutMinutes} minutes`)
    })
  }

  return result.length
}

/**
 * Main execution logic for Task Timeout Recovery Cron
 */
async function executeTaskTimeoutCron() {
  try {
    await resetTimedOutTasks()
  } catch (error) {
    logger.error(error, '[TaskTimeout] Cron job execution error')
  }
}

// ==================== Cron Job 3: Order Close ====================

/**
 * Configuration for Order Close Cron
 * Closes expired payment orders in both WeChat and local database
 */
const ORDER_CLOSE_CONFIG = {
  enabled: env.CRON_ORDER_CLOSE_ENABLED,
  interval: env.CRON_ORDER_CLOSE_INTERVAL,
  batchSize: env.CRON_ORDER_CLOSE_BATCH_SIZE,
}

/**
 * Close order in payment provider
 * Routes to the appropriate payment provider's close order API
 *
 * @param outTradeNo - Merchant order number
 * @param provider - Payment provider (wechat/alipay/stripe/manual)
 * @returns true if closed successfully or already closed, false if provider not enabled
 */
async function closeOrderInProvider(outTradeNo: string, provider: PaymentProvider): Promise<boolean> {
  switch (provider) {
    case 'wechat':
      if (!isWeChatPayEnabled()) {
        logger.warn(`[OrderClose] WeChat Pay not enabled, skipping: ${outTradeNo}`)
        return false
      }
      try {
        await closeWechatOrder(outTradeNo)
        logger.info(`[OrderClose] Closed WeChat order: ${outTradeNo}`)
      } catch (error: any) {
        const errorMessage = error.message || ''
        // These errors mean the order is already closed or doesn't exist
        if (
          errorMessage.includes('ORDER_CLOSED') ||
          errorMessage.includes('ORDERNOTEXIST') ||
          errorMessage.includes('ORDER_PAID')
        ) {
          logger.info(`[OrderClose] WeChat order already closed or not exists: ${outTradeNo}`)
        } else {
          throw error
        }
      }
      return true

    case 'alipay':
      if (!isAlipayEnabled()) {
        logger.warn(`[OrderClose] Alipay not enabled, skipping: ${outTradeNo}`)
        return false
      }
      // closeAlipayOrder already handles "already closed" cases internally
      await closeAlipayOrder(outTradeNo)
      logger.info(`[OrderClose] Closed Alipay order: ${outTradeNo}`)
      return true

    case 'stripe':
      // TODO: Implement Stripe order close when needed
      logger.info(`[OrderClose] Stripe order close not implemented, skipping: ${outTradeNo}`)
      return true

    case 'manual':
      // Manual orders don't need external API calls
      logger.info(`[OrderClose] Manual order, no external API needed: ${outTradeNo}`)
      return true

    default:
      logger.warn(`[OrderClose] Unknown provider '${provider}', skipping: ${outTradeNo}`)
      return false
  }
}

/**
 * Close expired payment orders
 * This finds all pending orders that have passed their expiration time
 * and attempts to close them in the respective payment provider and locally
 *
 * Supports multiple payment providers: wechat, alipay, stripe, manual
 */
async function closeExpiredOrders(): Promise<number> {
  const result = await db.transaction(async (tx) => {
    const { rows } = await tx.execute<ExpiredOrderRow>(sql`
      SELECT id, out_trade_no, provider, amount, expire_time
      FROM charge_orders
      WHERE status = 'pending'
        AND expire_time IS NOT NULL
        AND expire_time < NOW()
      ORDER BY expire_time ASC
      LIMIT ${ORDER_CLOSE_CONFIG.batchSize}
      FOR UPDATE SKIP LOCKED
    `)
    return rows || []
  })

  if (result.length === 0) {
    return 0
  }

  logger.info(`[OrderClose] Found ${result.length} expired payment orders to close`)

  let closedCount = 0

  for (const order of result) {
    try {
      // Close order in payment provider (wechat/alipay/stripe/manual)
      const closed = await closeOrderInProvider(order.out_trade_no, order.provider)

      if (!closed) {
        // Provider not enabled, skip this order for now
        continue
      }

      // Update local status to closed
      await db.execute(sql`
        UPDATE charge_orders
        SET status = 'closed',
            metadata = jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{closedAt}',
              to_jsonb(NOW()::text)
            ),
            metadata = jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{closedBy}',
              '"cron"'::jsonb
            ),
            metadata = jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{closeReason}',
              '"expired"'::jsonb
            )
        WHERE id = ${order.id}
      `)

      closedCount++
      logger.info(
        `[OrderClose] Closed expired ${order.provider} order: ${order.out_trade_no} (${order.amount / 100}元)`
      )
    } catch (error) {
      logger.error(
        error,
        `[OrderClose] Failed to close expired ${order.provider} order: ${order.out_trade_no}`
      )
    }
  }

  if (closedCount > 0) {
    logger.info(`[OrderClose] Successfully closed ${closedCount} expired payment orders`)
  }

  return closedCount
}

/**
 * Main execution logic for Order Close Cron
 */
async function executeOrderCloseCron() {
  try {
    await closeExpiredOrders()
  } catch (error) {
    logger.error(error, '[OrderClose] Cron job execution error')
  }
}

// ==================== Cron Job Management ====================

let taskEnqueueCron: Cron | null = null
let taskTimeoutCron: Cron | null = null
let orderCloseCron: Cron | null = null

/**
 * Initialize all cron workers
 * This function is idempotent - calling it multiple times has no effect
 */
export function initCron() {
  logger.info('Initializing cron workers...')

  // Initialize Task Enqueue Cron
  if (TASK_ENQUEUE_CONFIG.enabled) {
    if (!taskEnqueueCron) {
      logger.info(`  - Task Enqueue: ${TASK_ENQUEUE_CONFIG.interval} (batch: ${TASK_ENQUEUE_CONFIG.batchSize})`)
      taskEnqueueCron = new Cron(TASK_ENQUEUE_CONFIG.interval, executeTaskEnqueueCron)
      logger.info('  ✓ Task Enqueue cron initialized')
    } else {
      logger.info('  - Task Enqueue cron already initialized, skipping')
    }
  } else {
    logger.info('  - Task Enqueue cron disabled')
  }

  // Initialize Task Timeout Recovery Cron
  if (TASK_TIMEOUT_CONFIG.enabled) {
    if (!taskTimeoutCron) {
      logger.info(
        `  - Task Timeout: ${TASK_TIMEOUT_CONFIG.interval} (timeout: ${TASK_TIMEOUT_CONFIG.timeoutMinutes}min)`
      )
      taskTimeoutCron = new Cron(TASK_TIMEOUT_CONFIG.interval, executeTaskTimeoutCron)
      logger.info('  ✓ Task Timeout cron initialized')
    } else {
      logger.info('  - Task Timeout cron already initialized, skipping')
    }
  } else {
    logger.info('  - Task Timeout cron disabled')
  }

  // Initialize Order Close Cron
  if (ORDER_CLOSE_CONFIG.enabled) {
    if (!orderCloseCron) {
      logger.info(`  - Order Close: ${ORDER_CLOSE_CONFIG.interval} (batch: ${ORDER_CLOSE_CONFIG.batchSize})`)
      orderCloseCron = new Cron(ORDER_CLOSE_CONFIG.interval, executeOrderCloseCron)
      logger.info('  ✓ Order Close cron initialized')
    } else {
      logger.info('  - Order Close cron already initialized, skipping')
    }
  } else {
    logger.info('  - Order Close cron disabled')
  }

  logger.info('Cron workers initialization complete')
}

/**
 * Stop all cron workers (useful for testing or graceful shutdown)
 */
export function stopCron() {
  let stoppedCount = 0

  if (taskEnqueueCron) {
    taskEnqueueCron.stop()
    taskEnqueueCron = null
    stoppedCount++
  }

  if (taskTimeoutCron) {
    taskTimeoutCron.stop()
    taskTimeoutCron = null
    stoppedCount++
  }

  if (orderCloseCron) {
    orderCloseCron.stop()
    orderCloseCron = null
    stoppedCount++
  }

  if (stoppedCount > 0) {
    logger.info(`Stopped ${stoppedCount} cron worker(s)`)
  }
}