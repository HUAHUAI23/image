/**
 * Semaphore - Global concurrency control
 *
 * Controls the maximum number of concurrent operations across all tasks.
 * Used to limit API requests to external services (e.g., Volcengine Seedream).
 *
 * Features:
 * - FIFO queue for fair scheduling
 * - Non-blocking acquire with Promise
 * - Status monitoring (available permits, waiting count)
 *
 * @example
 * const semaphore = new Semaphore(100)  // Max 100 concurrent
 *
 * async function doWork() {
 *   await semaphore.acquire()
 *   try {
 *     await callAPI()
 *   } finally {
 *     semaphore.release()
 *   }
 * }
 */

import { logger as baseLogger } from '@/lib/logger'

const logger = baseLogger.child({ module: 'lib/semaphore' })

export class Semaphore {
  private permits: number
  private readonly maxPermits: number
  private readonly queue: Array<() => void> = []

  /**
   * Create a new Semaphore
   * @param permits - Maximum number of concurrent permits
   */
  constructor(permits: number) {
    if (permits < 1) {
      throw new Error('Semaphore permits must be at least 1')
    }
    this.permits = permits
    this.maxPermits = permits
  }

  /**
   * Acquire a permit, waiting if necessary
   * Returns immediately if a permit is available, otherwise waits in FIFO queue
   */
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--
      return
    }

    // Wait for a permit to be released
    return new Promise<void>((resolve) => {
      this.queue.push(resolve)
    })
  }

  /**
   * Release a permit
   * If there are waiting tasks, the next one in queue is immediately granted
   */
  release(): void {
    const next = this.queue.shift()
    if (next) {
      // Pass permit directly to next waiting task
      next()
    } else {
      // Return permit to pool
      this.permits++
    }
  }

  /**
   * Execute a function with automatic permit management
   * Acquires permit before execution and releases after (even on error)
   */
  async withPermit<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }

  /**
   * Get the number of available permits
   */
  get available(): number {
    return this.permits
  }

  /**
   * Get the number of tasks waiting for permits
   */
  get waiting(): number {
    return this.queue.length
  }

  /**
   * Get the maximum number of permits
   */
  get max(): number {
    return this.maxPermits
  }

  /**
   * Get current status for monitoring
   */
  getStatus(): { available: number; waiting: number; max: number; inUse: number } {
    return {
      available: this.permits,
      waiting: this.queue.length,
      max: this.maxPermits,
      inUse: this.maxPermits - this.permits,
    }
  }
}

/**
 * Global API concurrency pool
 * Shared across all tasks to control total concurrent requests to Volcengine
 *
 * Volcengine limit: 2000 tasks per minute
 * With ~10s per request, max concurrency = 2000 / 6 ≈ 333
 * Conservative setting: 300 (with 10% headroom)
 */
let globalApiSemaphore: Semaphore | null = null

/**
 * Initialize the global API semaphore
 * Called once during application startup
 */
export function initGlobalApiSemaphore(concurrency: number): Semaphore {
  if (!globalApiSemaphore) {
    globalApiSemaphore = new Semaphore(concurrency)
    logger.info(`Global API semaphore initialized with ${concurrency} permits`)
  }
  return globalApiSemaphore
}

/**
 * Get the global API semaphore
 * Throws if not initialized
 */
export function getGlobalApiSemaphore(): Semaphore {
  if (!globalApiSemaphore) {
    throw new Error('Global API semaphore not initialized. Call initGlobalApiSemaphore first.')
  }
  return globalApiSemaphore
}

/**
 * Check if global API semaphore is initialized
 */
export function isGlobalApiSemaphoreInitialized(): boolean {
  return globalApiSemaphore !== null
}
