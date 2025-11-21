/**
 * Prompt Templates API Route
 *
 * GET /api/templates
 * Query: ?category=industry (optional)
 * Response: { success: boolean, templates: Template[], error?: string }
 */

import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

import { db } from '@/db'
import { promptTemplates } from '@/db/schema'
import { getSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Get category from query params
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')

    // Query templates
    let templates

    if (category) {
      templates = await db.query.promptTemplates.findMany({
        where: eq(promptTemplates.category, category),
      })
    } else {
      templates = await db.query.promptTemplates.findMany()
    }

    return NextResponse.json({
      success: true,
      templates,
    })
  } catch (error) {
    console.error('[API] Failed to fetch templates:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch templates',
      },
      { status: 500 }
    )
  }
}
