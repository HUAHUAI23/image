/**
 * VLM (Vision Language Model) Service
 *
 * Uses Doubao-Seed-1.6-vision via Volcengine ARK API
 * Implemented with LangChain OpenAI SDK
 */

import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { ChatOpenAI } from '@langchain/openai'

import { env } from '@/lib/env'
import { logger as baseLogger } from '@/lib/logger'

const logger = baseLogger.child({ module: 'lib/vlm' })

// ============================================================================
// LangChain ChatOpenAI Client for ARK API
// ============================================================================

const vlmClient = new ChatOpenAI({
  apiKey: env.ARK_API_KEY,
  configuration: {
    baseURL: env.ARK_BASE_URL,
    defaultHeaders: {
      'x-is-encrypted': 'true',
    },
  },
  model: env.ARK_MODEL,
})

// ============================================================================
// System Prompt
// ============================================================================

const VLM_SYSTEM_PROMPT = `你是一个专业的图像分析AI助手。你的任务是详细、准确地描述图片内容。

描述要求：
1. 识别图片中的主要主体（人物、物品、场景等）
2. 描述人物的特征、动作、表情（如有）
3. 描述场景的环境、氛围、色调
4. 提取并记录图片中的所有文字内容（包括标题、正文、标签等）
5. 注意构图、布局、排版细节
6. 字数控制在200字以内，简洁准确

请用中文回答，专业且客观。`

// ============================================================================
// VLM Analysis
// ============================================================================

/**
 * Analyze image using Doubao-Seed-1.6-vision model
 *
 * @param imageUrl - Direct URL to the image (must be publicly accessible)
 * @returns Text description of the image (max 200 characters)
 */
export async function analyzeImage(imageUrl: string): Promise<string> {
  try {
    // Build messages with system prompt and image
    const messages = [
      new SystemMessage(VLM_SYSTEM_PROMPT),
      new HumanMessage({
        content: [
          {
            type: 'image_url',
            image_url: {
              url: imageUrl,
            },
          },
          {
            type: 'text',
            text: '请详细描述这张图片的内容，包括主要主体，人物、场景、文字内容，字数在200字以内。',
          },
        ],
      }),
    ]

    // Invoke VLM model
    const response = await vlmClient.invoke(messages)

    const content = response.content

    if (!content || typeof content !== 'string') {
      throw new Error('ARK API returned empty or invalid analysis content')
    }

    return content
  } catch (error) {
    logger.error(error, 'VLM analysis failed')
    throw new Error(
      `VLM analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

/**
 * Batch analyze multiple images (sequential)
 */
export async function analyzeImages(imageUrls: string[]): Promise<string[]> {
  const results: string[] = []

  for (const url of imageUrls) {
    try {
      const result = await analyzeImage(url)
      results.push(result)
    } catch (error) {
      logger.error(error, `Failed to analyze ${url}`)
      results.push('') // Push empty string for failed analysis
    }
  }

  return results
}
