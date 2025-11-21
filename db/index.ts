import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import { env } from '../lib/env'

import { drizzleLogger } from './logger'
import * as relations from './relation'
import * as schema from './schema'

const globalForDb = globalThis as unknown as {
  conn: Pool | undefined
}

const conn =
  globalForDb.conn ??
  new Pool({
    connectionString: env.DATABASE_URL,
    // 连接池配置 - 根据实际需求调整
    max: 20, // 最大连接数
    idleTimeoutMillis: 30000, // 空闲连接超时时间
    connectionTimeoutMillis: 2000, // 连接超时时间
  })

if (env.NODE_ENV !== 'production') globalForDb.conn = conn

// 合并 schema 和 relations，这样才能使用 Drizzle 的 Relational Query API
// 在非生产环境启用 SQL 查询日志，方便调试
export const db = drizzle(conn, {
  schema: { ...schema, ...relations },
  logger: env.NODE_ENV !== 'production' ? drizzleLogger : undefined,
})
