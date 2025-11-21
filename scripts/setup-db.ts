import { Pool } from 'pg'

import { env } from '../lib/env'

async function setupDatabase() {
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
    console.log(`Checking if database '${dbName}' exists...`)

    // Check if database exists
    const result = await defaultPool.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName])

    if (result.rows.length === 0) {
      console.log(`Database '${dbName}' does not exist. Creating...`)
      // Create the database (must be done outside a transaction)
      await defaultPool.query(`CREATE DATABASE "${dbName}"`)
      console.log(`✓ Database '${dbName}' created successfully`)
    } else {
      console.log(`✓ Database '${dbName}' already exists`)
    }
  } catch (error) {
    console.error('Error setting up database:', error)
    process.exit(1)
  } finally {
    await defaultPool.end()
  }
}

setupDatabase()
