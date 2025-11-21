import { Cron } from 'croner'
import { db } from '@/db'
import { sql } from 'drizzle-orm'
import { addToQueue } from './queue'
import { logger as baseLogger } from '@/lib/logger'
const logger = baseLogger.child({ module: 'lib/cron' })

let job: Cron

export function initCron() {
  if (job) return // prevent multiple inits

  logger.info('Initializing Cron Worker...')
  job = new Cron('*/5 * * * * *', async () => {
    try {
      // Use SELECT FOR UPDATE SKIP LOCKED for true concurrency safety
      // This ensures multiple cron instances can run simultaneously without conflicts
      const processingTasks = await db.transaction(async (tx) => {
        // Atomically select and update pending tasks using raw SQL
        // FOR UPDATE SKIP LOCKED allows concurrent cron instances to pick different tasks
        const result = await tx.execute<{
          id: number
          account_id: number
          name: string
          type: 'text_to_image' | 'image_to_image'
          status: string
          vlm_prompt: string | null
          template_prompt_id: number | null
          user_prompt: string | null
          original_image_url: string | null
          generated_image_urls: string[]
          image_number: number
          error_details: any
          created_at: Date
          updated_at: Date
        }>(sql`
          UPDATE tasks
          SET status = 'processing', updated_at = NOW()
          WHERE id IN (
            SELECT id FROM tasks
            WHERE status = 'pending'
            ORDER BY created_at ASC
            LIMIT 10
            FOR UPDATE SKIP LOCKED
          )
          RETURNING *
        `)

        const updatedTasks = result.rows || []

        if (updatedTasks.length > 0) {
          logger.info(`Marked ${updatedTasks.length} tasks as processing`)
        }

        return updatedTasks
      })

      // Add tasks to queue
      if (processingTasks.length > 0) {
        logger.info(`Enqueuing ${processingTasks.length} tasks`)
        for (const task of processingTasks) {
          addToQueue({ id: task.id, type: task.type })
        }
      }
    } catch (e) {
      logger.error(e, 'Cron error')
    }
  })
}
