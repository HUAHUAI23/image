import { Pool } from 'pg'

import { env } from '../lib/env'

async function resetDatabase() {
  // Parse the database URL to extract connection details
  const url = new URL(env.DATABASE_URL)
  const dbName = url.pathname.slice(1) // Remove leading '/'

  // Create a connection to the default 'postgres' database
  const defaultPool = new Pool({
    host: url.hostname,
    port: parseInt(url.port || '5432'),
    user: url.username,
    password: url.password,
    database: 'postgres', // Connect to default database
  })

  try {
    console.log(`Resetting database '${dbName}'...`)

    // Terminate all connections to the target database
    await defaultPool.query(
      `
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = $1 AND pid <> pg_backend_pid()
    `,
      [dbName]
    )

    // Drop the database if it exists
    await defaultPool.query(`DROP DATABASE IF EXISTS "${dbName}"`)
    console.log(`✓ Database '${dbName}' dropped`)

    // Create the database
    await defaultPool.query(`CREATE DATABASE "${dbName}"`)
    console.log(`✓ Database '${dbName}' created successfully`)
  } catch (error) {
    console.error('Error resetting database:', error)
    process.exit(1)
  } finally {
    await defaultPool.end()
  }

  // 连接到新创建的数据库，删除不需要的扩展
  const newDbPool = new Pool({
    host: url.hostname,
    port: parseInt(url.port || '5432'),
    user: url.username,
    password: url.password,
    database: dbName,
  })

  try {
    // 删除 PostgreSQL 监控扩展（开发环境不需要）
    await newDbPool.query(`DROP EXTENSION IF EXISTS pg_stat_statements CASCADE`)
    console.log(`✓ Removed pg_stat_statements extension`)
  } catch (error) {
    console.error('Warning: Could not remove extensions:', error)
  } finally {
    await newDbPool.end()
  }
}

resetDatabase()
