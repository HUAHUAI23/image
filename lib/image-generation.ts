/**
 * Image Generation Service
 *
 * Uses Seedream4.0 via Volcengine ARK API
 * Supports text-to-image and image-to-image generation
 * Implemented with LangChain OpenAI SDK
 */

import { ChatOpenAI } from '@langchain/openai'
import { Liquid } from 'liquidjs'
import { env } from '@/lib/env'
import { logger as baseLogger } from '@/lib/logger'
const logger = baseLogger.child({ module: 'lib/image-generation' })

// Initialize Liquid template engine
const liquid = new Liquid()

// ============================================================================
// LangChain ChatOpenAI Client for Seedream API
// ============================================================================

const seedreamClient = new ChatOpenAI({
  openAIApiKey: env.SEEDREAM_API_KEY,
  configuration: {
    baseURL: env.SEEDREAM_BASE_URL,
  },
  model: env.SEEDREAM_MODEL,
})

// ============================================================================
// Types
// ============================================================================

export interface GenerateImagesOptions {
  /** Original image URL (for image-to-image) */
  originalImageUrl?: string
  /** User custom prompt (will be used as {{ prompt }} in template) */
  userPrompt: string
  /** Template prompt from database (with {{ prompt }} placeholder) */
  templatePrompt?: string
  /** Number of images to generate */
  imageCount?: number
  /** Image size (e.g., "1024x1024", "2048x2048", or "2k") */
  size?: string
  /** Timeout per image in seconds */
  timeout?: number
  /** Maximum concurrent requests (default: SEEDREAM_CONCURRENCY env var, fallback: 20) */
  concurrency?: number
}

export interface GeneratedImage {
  /** Image URL returned by API */
  url: string
  /** Image index in batch */
  index: number
  /** Whether generation succeeded */
  success: boolean
  /** Error message if failed */
  error?: string
}

export interface GenerateImagesResult {
  /** Successfully generated image URLs */
  successUrls: string[]
  /** Failed image generation details */
  failures: Array<{ index: number; error: string }>
  /** Total requested count */
  totalRequested: number
  /** Successfully generated count */
  successCount: number
}

// ============================================================================
// Prompt Rendering
// ============================================================================

/**
 * Render final prompt from template and user prompt
 *
 * If templatePrompt is provided, use liquidjs to render with {{ prompt }} placeholder
 * Otherwise, use userPrompt directly
 */
async function renderPrompt(options: GenerateImagesOptions): Promise<string> {
  const { userPrompt, templatePrompt } = options

  // If template is provided, render it with userPrompt as {{ prompt }} variable
  if (templatePrompt) {
    try {
      return await liquid.parseAndRender(templatePrompt, { prompt: userPrompt })
    } catch (error) {
      console.error('[ImageGen] Template render failed:', error)
      // Fallback to userPrompt if template rendering fails
      return userPrompt
    }
  }

  // Otherwise, use userPrompt directly
  return userPrompt
}

// ============================================================================
// Image Size Detection
// ============================================================================

/**
 * Detect image size from URL
 * Returns size string like "1024x768" or null if failed
 */
async function detectImageSize(imageUrl: string): Promise<string | null> {
  try {
    const response = await fetch(imageUrl, { method: 'HEAD' })
    if (!response.ok) {
      console.warn('[ImageGen] Failed to fetch image headers:', response.statusText)
      return null
    }

    // Try to get actual image to detect size
    const imageResponse = await fetch(imageUrl)
    const blob = await imageResponse.blob()

    // Use browser Image API to get dimensions (Node.js would need sharp or similar)
    // For server-side, we'll skip size detection for now
    logger.warn('[ImageGen] Image size detection not implemented for server-side')
    return null
  } catch (error) {
    logger.error(error, 'Size detection failed')
    return null
  }
}

// ============================================================================
// Image Generation via Raw HTTP
// ============================================================================

/**
 * Generate a single image using raw HTTP request
 * (OpenAI SDK doesn't support custom image generation parameters)
 *
 * @param prompt - Final prompt for generation
 * @param options - Generation options
 * @param index - Image index in batch
 * @returns Generated image result
 */
async function generateSingleImage(
  prompt: string,
  options: GenerateImagesOptions,
  index: number
): Promise<GeneratedImage> {
  const { originalImageUrl, size = '2k', timeout = 120 } = options
  const maxRetries = 3
  let attempts = 0

  while (attempts < maxRetries) {
    attempts++
    logger.info(`Image ${index + 1}: Attempt ${attempts}/${maxRetries}`)

    try {
      const startTime = Date.now()

      // Build request body
      const requestBody: any = {
        model: env.SEEDREAM_MODEL,
        prompt,
        response_format: 'url',
        size,
        n: 1, // Generate one image at a time
        watermark: false,
      }

      // Add original image for image-to-image
      if (originalImageUrl) {
        requestBody.image = [originalImageUrl]
        requestBody.sequential_image_generation = 'auto'
      }

      // Make raw HTTP request to ARK API
      const response = await fetch(`${env.SEEDREAM_BASE_URL}/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.SEEDREAM_API_KEY}`,
        },
        body: JSON.stringify(requestBody),
      })

      // Check timeout
      if (Date.now() - startTime >= timeout * 1000) {
        logger.warn(`Image ${index + 1}: Timeout, retrying...`)
        continue
      }

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`API request failed: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()

      // Extract image URL
      if (result.data && result.data.length > 0 && result.data[0].url) {
        const imageUrl = result.data[0].url
        logger.info(`Image ${index + 1}: Generated successfully`)

        return {
          url: imageUrl,
          index,
          success: true,
        }
      }

      throw new Error('No image URL in response')
    } catch (error) {
      logger.error(error, `Image ${index + 1}: Generation failed`)

      if (attempts >= maxRetries) {
        return {
          url: '',
          index,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      }

      // Wait before retry (exponential backoff)
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempts) * 1000))
    }
  }

  return {
    url: '',
    index,
    success: false,
    error: 'Max retries exceeded',
  }
}

// ============================================================================
// Concurrency Control Helper
// ============================================================================

/**
 * Execute async tasks with concurrency limit
 * Uses a queue-based approach with no external dependencies
 *
 * @param tasks - Array of async task functions
 * @param concurrency - Maximum concurrent tasks
 * @returns Array of results in same order as tasks
 */
async function parallelLimit<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let index = 0

  // Worker function that processes tasks from the queue
  const worker = async (): Promise<void> => {
    while (index < tasks.length) {
      const currentIndex = index++
      const task = tasks[currentIndex]
      try {
        results[currentIndex] = await task()
      } catch (error) {
        // Task should handle its own errors, but catch here as safety
        logger.error(error, `Task ${currentIndex} failed`)
        results[currentIndex] = error as T
      }
    }
  }

  // Create worker pool with specified concurrency
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker())

  // Wait for all workers to complete
  await Promise.all(workers)

  return results
}

// ============================================================================
// Parallel Image Generation
// ============================================================================

/**
 * Generate multiple images in parallel with detailed result information
 *
 * @param options - Generation options
 * @returns Detailed generation results including successes and failures
 */
export async function generateImagesDetailed(
  options: GenerateImagesOptions
): Promise<GenerateImagesResult> {
  const { imageCount = env.SEEDREAM_BATCH_SIZE, concurrency = env.SEEDREAM_CONCURRENCY } = options

  logger.info(
    `Starting parallel generation of ${imageCount} images (concurrency: ${concurrency})`
  )

  // Render final prompt
  const prompt = await renderPrompt(options)
  logger.info(`Final prompt: ${prompt.substring(0, 100)}...`)

  // Detect image size if original image is provided
  if (options.originalImageUrl && !options.size) {
    const detectedSize = await detectImageSize(options.originalImageUrl)
    if (detectedSize) {
      options.size = detectedSize
      logger.info(`Detected size: ${detectedSize}`)
    }
  }

  // Generate all images with concurrency control
  const tasks = Array.from({ length: imageCount }, (_, index) => () =>
    generateSingleImage(prompt, options, index)
  )

  const results = await parallelLimit(tasks, concurrency)

  // Separate successes and failures
  const successfulResults = results.filter((r) => r.success)
  const failedResults = results.filter((r) => !r.success)

  const successUrls = successfulResults.map((r) => r.url)
  const failures = failedResults.map((r) => ({
    index: r.index,
    error: r.error || 'Unknown error',
  }))

  logger.info(`Generated ${successfulResults.length}/${imageCount} images successfully`)
  if (failures.length > 0) {
    logger.info(`${failures.length} images failed`)
  }

  return {
    successUrls,
    failures,
    totalRequested: imageCount,
    successCount: successfulResults.length,
  }
}

/**
 * Generate multiple images in parallel (legacy, throws on any failure)
 *
 * @param options - Generation options
 * @returns Array of generated image URLs
 * @deprecated Use generateImagesDetailed for better error handling
 */
export async function generateImages(options: GenerateImagesOptions): Promise<string[]> {
  const result = await generateImagesDetailed(options)

  if (result.successCount === 0) {
    throw new Error('All image generation attempts failed')
  }

  // Return URLs in order
  return result.successUrls
}

/**
 * Generate images for text-to-image task
 */
export async function generateFromText(prompt: string, imageCount?: number): Promise<string[]> {
  return generateImages({
    userPrompt: prompt,
    imageCount,
  })
}

/**
 * Generate images for image-to-image task
 */
export async function generateFromImage(
  originalImageUrl: string,
  userPrompt: string,
  options?: {
    templatePrompt?: string
    imageCount?: number
  }
): Promise<string[]> {
  return generateImages({
    originalImageUrl,
    userPrompt,
    templatePrompt: options?.templatePrompt,
    imageCount: options?.imageCount,
  })
}
