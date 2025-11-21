/**
 * VLM Analysis API Route
 *
 * POST /api/vlm/analyze
 * Body: { imageUrl: string }
 * Response: { success: boolean, analysis?: string, error?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { analyzeImage } from '@/lib/vlm'
import { getSession } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body = await request.json()
    const { imageUrl } = body

    if (!imageUrl || typeof imageUrl !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invalid imageUrl parameter' },
        { status: 400 }
      )
    }

    // Validate URL format
    try {
      new URL(imageUrl)
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid URL format' }, { status: 400 })
    }

    // Analyze image
    const analysis = await analyzeImage(imageUrl)

    return NextResponse.json({
      success: true,
      analysis,
    })
  } catch (error) {
    console.error('[API] VLM analysis failed:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'VLM analysis failed',
      },
      { status: 500 }
    )
  }
}
