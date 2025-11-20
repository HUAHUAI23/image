import { Cron } from 'croner'
import { db } from '@/db'
import { tasks } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { addToQueue } from './queue'

let job: Cron;

export function initCron() {
  if (job) return // prevent multiple inits

  console.log('Initializing Cron Worker...')
  job = new Cron('*/5 * * * * *', async () => {
    try {
        const pendingTasks = await db.query.tasks.findMany({
            where: eq(tasks.status, 'pending'),
            limit: 10
        })

        if (pendingTasks.length > 0) {
            console.log(`Found ${pendingTasks.length} pending tasks`)
            for (const task of pendingTasks) {
                addToQueue({ id: task.id, type: task.type })
            }
        }
    } catch (e) {
        console.error("Cron error:", e)
    }
  })
}