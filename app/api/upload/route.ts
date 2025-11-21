/**
 * Upload and Analyze Image API
 *
 * POST /api/upload
 * Body: FormData { image: File, taskName: string }
 * Response: { success: boolean, imageUrl?: string, analysis?: string, error?: string }
 *
 * Note: Uploads to temporary location (originalImage/{userId}/temp-{timestamp}/)
 * since task hasn't been created yet
 *
 * Pricing:
 * - If ANALYSIS_PRICE = 0: Free analysis
 * - If ANALYSIS_PRICE > 0: Charge user and check balance
 */

import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

import { db } from '@/db'
import { accounts, transactions } from '@/db/schema'
import { getSession } from '@/lib/auth'
import { formatCurrency } from '@/lib/const'
import { env } from '@/lib/env'
import { uploadFileToTempTOS } from '@/lib/tos'
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

    if (!image) {
      return NextResponse.json({ success: false, error: 'No image provided' }, { status: 400 })
    }

    // Upload to TOS temporary location (task doesn't exist yet)
    // Path: originalImage/{userId}/temp-{timestamp}/filename.jpg
    const imageUrl = await uploadFileToTempTOS(image, session.userId)

    // Get analysis price from environment
    const analysisPrice = env.ANALYSIS_PRICE

    // If price > 0, check balance and charge
    if (analysisPrice > 0) {
      // Get user account
      const account = await db.query.accounts.findFirst({
        where: eq(accounts.userId, session.userId),
      })

      if (!account) {
        return NextResponse.json(
          { success: false, error: '账户未找到，请联系管理员' },
          { status: 404 }
        )
      }

      // Check balance
      if (account.balance < analysisPrice) {
        return NextResponse.json(
          {
            success: false,
            error: `余额不足，图片分析需要 ${formatCurrency(analysisPrice)}，当前余额 ${formatCurrency(account.balance)}`,
          },
          { status: 402 } // 402 Payment Required
        )
      }

      // Perform analysis first (before charging)
      const analysis = await analyzeImage(imageUrl)

      // Charge user in a transaction (only after successful analysis)
      await db.transaction(async (tx) => {
        // Deduct balance
        const newBalance = account.balance - analysisPrice
        await tx.update(accounts).set({ balance: newBalance }).where(eq(accounts.id, account.id))

        // Create transaction record
        await tx.insert(transactions).values({
          accountId: account.id,
          taskId: null, // No task associated with analysis
          amount: analysisPrice,
          type: 'charge',
          balanceBefore: account.balance,
          balanceAfter: newBalance,
        })
      })

      return NextResponse.json({
        success: true,
        imageUrl,
        analysis,
        charged: formatCurrency(analysisPrice),
      })
    }

    // Free analysis (price = 0)
    const analysis = await analyzeImage(imageUrl)

    return NextResponse.json({
      success: true,
      imageUrl,
      analysis,
      charged: '免费',
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
