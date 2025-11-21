// db/logger.ts
import type { Logger } from 'drizzle-orm'

import { logger as pinoLogger } from '../lib/logger'

/**
 * Drizzle Logger 适配器
 * 将 Drizzle 的日志输出适配到 Pino logger
 */
export class DrizzleLogger implements Logger {
  logQuery(query: string, params: unknown[]): void {
    pinoLogger.debug(
      {
        sql: query,
        params,
      },
      'Database query'
    )
  }
}

export const drizzleLogger = new DrizzleLogger()
