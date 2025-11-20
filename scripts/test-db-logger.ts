// scripts/test-db-logger.ts
import { db } from '../db'
import { users } from '../db/schema'

async function testLogger() {
  console.log('Testing Drizzle logger integration...\n')

  try {
    // 执行一个简单的查询 - 这会触发 logger
    const result = await db.select().from(users).limit(1)

    console.log('\n✓ Query executed successfully')
    console.log('✓ Check the logs above to see SQL query logging')
    console.log(`✓ Found ${result.length} user(s)`)

    process.exit(0)
  } catch (error) {
    console.error('✗ Error:', error)
    process.exit(1)
  }
}

testLogger()
