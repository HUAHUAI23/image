/**
 * Image Download Proxy API
 *
 * GET /api/download?url=<image_url>
 *
 * Proxies image downloads to bypass CORS restrictions.
 * This allows downloading images from TOS/external sources that don't allow direct CORS access.
 */

import { NextRequest, NextResponse } from 'next/server'

import { getSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get image URL from query params
    const url = request.nextUrl.searchParams.get('url')
    if (!url) {
      return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
    }

    // Validate URL format
    try {
      new URL(url)
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 })
    }

    // Fetch image from the source
    const response = await fetch(url)

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch image: ${response.status}` },
        { status: response.status }
      )
    }

    // Get content type from response
    const contentType = response.headers.get('content-type') || 'application/octet-stream'

    // Stream the image back to client
    const blob = await response.blob()
    const arrayBuffer = await blob.arrayBuffer()

    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': 'attachment',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    console.error('[API] Download proxy failed:', error)

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Download failed',
      },
      { status: 500 }
    )
  }
}