import fastq from 'fastq'
import type { queueAsPromised } from 'fastq'
import { db } from '@/db'
import { tasks, accounts, transactions, prices } from '@/db/schema'
import { eq } from 'drizzle-orm'

type Task = {
  id: number
  type: 'text_to_image' | 'image_to_image'
}

const enqueued = new Set<number>()

async function processTask(task: Task) {
  console.log(`Start processing task ${task.id}`)
  try {
    // Update status to processing
    await db.update(tasks)
        .set({ status: 'processing' })
        .where(eq(tasks.id, task.id))

    // Simulate VLM Analysis (2 seconds)
    await new Promise(resolve => setTimeout(resolve, 2000))

    const vlmPrompt = task.type === 'image_to_image'
        ? "A detailed analysis of the uploaded image."
        : ""

    // Simulate Image Generation (3 seconds)
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Mock result
    const generatedImageUrl = `https://picsum.photos/seed/${task.id}/1024/1024`

    // Update success
    await db.update(tasks)
        .set({
            status: 'success',
            vlmPrompt,
            generatedImageUrl,
            updatedAt: new Date()
        })
        .where(eq(tasks.id, task.id))

    console.log(`Task ${task.id} completed successfully.`)

  } catch (error) {
    console.error(`Task ${task.id} failed`, error)

    // Fail logic
    await db.transaction(async (tx) => {
        await tx.update(tasks)
            .set({ status: 'failed', updatedAt: new Date() })
            .where(eq(tasks.id, task.id))

        // Refund
        const taskRecord = await tx.query.tasks.findFirst({
            where: eq(tasks.id, task.id)
        })

        if (taskRecord) {
            const txRecord = await tx.query.transactions.findFirst({
                where: eq(transactions.taskId, task.id)
            })

            if (txRecord && txRecord.type === 'charge') {
                const account = await tx.query.accounts.findFirst({
                    where: eq(accounts.id, taskRecord.accountId)
                })

                if (account) {
                     const newBalance = account.balance + txRecord.amount
                     await tx.update(accounts).set({ balance: newBalance }).where(eq(accounts.id, account.id))

                     await tx.insert(transactions).values({
                        accountId: account.id,
                        taskId: task.id,
                        amount: txRecord.amount,
                        type: 'refund',
                        balanceBefore: account.balance,
                        balanceAfter: newBalance
                    })
                    console.log(`Refunded task ${task.id}`)
                }
            }
        }
    })
  } finally {
    enqueued.delete(task.id)
  }
}

export const queue: queueAsPromised<Task> = fastq.promise(processTask, 1)

export function addToQueue(task: Task) {
    if (!enqueued.has(task.id)) {
        enqueued.add(task.id)
        queue.push(task)
        console.log(`Enqueued task ${task.id}`)
    }
}