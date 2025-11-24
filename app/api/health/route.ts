import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { db } from '@/db'

/**
 * Health check endpoint for Docker and load balancers
 * Verifies database connectivity and returns 200 OK if healthy
 */
export async function GET() {
  try {
    // Simple database query to verify connectivity
    await db.execute(sql`SELECT 1`)

    return NextResponse.json(
      {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'image-generation',
      },
      { status: 200 }
    )
  } catch (error) {
    // Database connection failed
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 503 }
    )
  }
}
