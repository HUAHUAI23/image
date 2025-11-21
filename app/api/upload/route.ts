/**
 * Upload and Analyze Image API
 *
 * POST /api/upload
 * Body: FormData { image: File, taskName: string }
 * Response: { success: boolean, imageUrl?: string, analysis?: string, error?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { uploadFileToTOS } from '@/lib/tos'
import { analyzeImage } from '@/lib/vlm'

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Parse form data
    const formData = await request.formData()
    const image = formData.get('image') as File | null
    const taskName = formData.get('taskName') as string

    if (!image) {
      return NextResponse.json({ success: false, error: 'No image provided' }, { status: 400 })
    }

    if (!taskName || taskName.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Task name is required' }, { status: 400 })
    }

    // Upload to TOS
    const imageUrl = await uploadFileToTOS(image, taskName, 'originalImage')

    // Analyze with VLM
    const analysis = await analyzeImage(imageUrl)

    return NextResponse.json({
      success: true,
      imageUrl,
      analysis,
    })
  } catch (error) {
    console.error('[API] Upload and analyze failed:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Upload and analyze failed',
      },
      { status: 500 }
    )
  }
}
