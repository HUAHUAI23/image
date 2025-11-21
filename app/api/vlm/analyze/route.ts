/**
 * VLM Analysis API Route
 *
 * POST /api/vlm/analyze
 * Body: { imageUrl: string }
 * Response: { success: boolean, analysis?: string, error?: string }
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
import { analyzeImage } from '@/lib/vlm'

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
        analysis,
        charged: formatCurrency(analysisPrice),
      })
    }

    // Free analysis (price = 0)
    const analysis = await analyzeImage(imageUrl)

    return NextResponse.json({
      success: true,
      analysis,
      charged: '免费',
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
