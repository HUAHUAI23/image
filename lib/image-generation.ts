/**
 * Image Generation Service
 *
 * Enterprise-grade image generation with:
 * - Global concurrency control via Semaphore (prevents exceeding Volcengine limits)
 * - Exponential backoff retry with jitter
 * - Real timeout control with AbortController
 * - Detailed error tracking
 *
 * Uses Seedream4.0 via Volcengine ARK API
 *
 * Volcengine limit: 2000 tasks per minute
 * Controlled by GLOBAL_API_CONCURRENCY (default: 300)
 */

import { Liquid } from 'liquidjs'

import { env } from '@/lib/env'
import { logger as baseLogger } from '@/lib/logger'
import { getGlobalApiSemaphore, initGlobalApiSemaphore } from '@/lib/semaphore'

const logger = baseLogger.child({ module: 'lib/image-generation' })

// Initialize global semaphore on module load
initGlobalApiSemaphore(env.GLOBAL_API_CONCURRENCY)

// ============================================================================
// Configuration
// ============================================================================

/**
 * Generation configuration with sensible defaults
 */
const CONFIG = {
  /** Default number of images to generate */
  DEFAULT_IMAGE_COUNT: 1,
  /** Default image size */
  DEFAULT_SIZE: '2k' as const,
  /** Request timeout in seconds */
  TIMEOUT_SECONDS: 120,
  /** Maximum retry attempts per image */
  MAX_RETRIES: 3,
  /** Initial retry delay in ms */
  INITIAL_RETRY_DELAY: 2000,
  /** Maximum retry delay in ms (cap for exponential backoff) */
  MAX_RETRY_DELAY: 30000,
} as const

// ============================================================================
// Types
// ============================================================================

export interface GenerateImagesOptions {
  /** Original image URLs (for image-to-image or multi-image fusion) */
  originalImageUrls?: string[]
  /** User custom prompt */
  userPrompt: string
  /** Template prompt with {{ prompt }} placeholder */
  templatePrompt?: string
  /** Number of batches to generate (each batch may produce multiple images in sequential mode) */
  imageCount?: number
  /** Image size (e.g., "1024x1024", "2048x2048", "2K", or "4K") */
  size?: string
  /** Sequential image generation mode */
  sequentialImageGeneration?: 'auto' | 'disabled'
  /** Sequential image generation options */
  sequentialImageGenerationOptions?: {
    maxImages?: number
  }
  /** Optimize prompt options */
  optimizePromptOptions?: {
    mode?: 'standard' | 'fast'
  }
  /** Whether to add watermark */
  watermark?: boolean
  /** Timeout per batch in seconds */
  timeout?: number
}

export interface GeneratedImage {
  /** Image URLs returned by API (single image or multiple in sequential mode) */
  urls: string[]
  /** Batch index */
  index: number
  /** Whether generation succeeded */
  success: boolean
  /** Error message if failed */
  error?: string
  /** Number of retry attempts used */
  attempts?: number
}

export interface GenerateImagesResult {
  /** Successfully generated image URLs (in order) */
  successUrls: string[]
  /** Failed image generation details */
  failures: Array<{ index: number; error: string; attempts: number }>
  /** Total requested count */
  totalRequested: number
  /** Successfully generated count */
  successCount: number
}

interface APIResponse {
  data?: Array<{ url?: string }>
  error?: { message?: string; code?: string }
}

// ============================================================================
// Liquid Template Engine
// ============================================================================

const liquid = new Liquid()

/**
 * Render final prompt from template and user prompt
 *
 * @param userPrompt - User's prompt text
 * @param templatePrompt - Optional template with {{ prompt }} placeholder
 * @returns Rendered prompt
 */
async function renderPrompt(userPrompt: string, templatePrompt?: string): Promise<string> {
  if (!templatePrompt) return userPrompt

  try {
    return await liquid.parseAndRender(templatePrompt, { prompt: userPrompt })
  } catch (error) {
    logger.error(error, 'Template render failed, falling back to user prompt')
    return userPrompt
  }
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Determine if an error is retryable
 *
 * Retryable errors: network issues, timeouts, rate limits, server errors (5xx)
 * Non-retryable: client errors (4xx except 429), auth errors
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()

    // Network errors
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('enotfound')
    ) {
      return true
    }

    // Rate limit errors (429)
    if (message.includes('429') || message.includes('rate limit')) {
      return true
    }

    // Server errors (5xx)
    if (
      message.includes('500') ||
      message.includes('502') ||
      message.includes('503') ||
      message.includes('504')
    ) {
      return true
    }

    // Abort errors (timeout)
    if (error.name === 'AbortError') {
      return true
    }
  }

  return false
}

/**
 * Calculate retry delay with exponential backoff and jitter
 *
 * Exponential backoff: 2s → 4s → 8s → ...
 * Jitter (±20%): prevents thundering herd problem
 *
 * @param attempt - Current attempt number (1-based)
 * @returns Delay in milliseconds
 */
function calculateRetryDelay(attempt: number): number {
  const baseDelay = CONFIG.INITIAL_RETRY_DELAY
  const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt - 1), CONFIG.MAX_RETRY_DELAY)

  // Add jitter (±20%) to prevent thundering herd
  const jitter = exponentialDelay * 0.2 * (Math.random() * 2 - 1)

  return Math.floor(exponentialDelay + jitter)
}

// ============================================================================
// Single Image Generation with Retry
// ============================================================================

/**
 * Generate a single batch (may produce single or multiple images in sequential mode)
 *
 * Features:
 * - Global semaphore for concurrency control (shared across all tasks)
 * - AbortController for real timeout control
 * - Exponential backoff with jitter
 * - Smart retry (only retryable errors)
 * - Supports sequential mode (returns multiple images)
 *
 * @param prompt - Final rendered prompt
 * @param options - Generation options
 * @returns Generated batch result (may contain multiple images)
 */
async function generateSingleImage(
  prompt: string,
  options: {
    originalImageUrls?: string[]
    size: string
    sequentialImageGeneration?: 'auto' | 'disabled'
    sequentialImageGenerationOptions?: { maxImages?: number }
    optimizePromptOptions?: { mode?: 'standard' | 'fast' }
    watermark?: boolean
    timeout: number
    index: number
  }
): Promise<GeneratedImage> {
  const {
    originalImageUrls,
    size,
    sequentialImageGeneration,
    sequentialImageGenerationOptions,
    optimizePromptOptions,
    watermark,
    timeout,
    index,
  } = options

  const semaphore = getGlobalApiSemaphore()
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
    try {
      logger.debug(`Batch ${index + 1}: Attempt ${attempt}/${CONFIG.MAX_RETRIES}, waiting for semaphore...`)

      // Wait for global semaphore permit (controls total concurrent requests to Volcengine)
      await semaphore.acquire()

      try {
        logger.info(
          `Batch ${index + 1}: Attempt ${attempt}/${CONFIG.MAX_RETRIES} (semaphore: ${semaphore.available}/${semaphore.max} available)`
        )

        // Create abort controller for timeout
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout * 1000)

        try {
          // Build request body
          const requestBody: Record<string, any> = {
            model: env.SEEDREAM_MODEL,
            prompt,
            response_format: 'url',
            size,
            watermark: watermark ?? false,
          }

          // Add original images for image-to-image or multi-image fusion
          if (originalImageUrls && originalImageUrls.length > 0) {
            if (originalImageUrls.length === 1) {
              requestBody.image = originalImageUrls[0]
            } else {
              requestBody.image = originalImageUrls
            }
          }

          // Add sequential image generation settings
          if (sequentialImageGeneration) {
            requestBody.sequential_image_generation = sequentialImageGeneration
            if (sequentialImageGeneration === 'auto' && sequentialImageGenerationOptions?.maxImages) {
              requestBody.sequential_image_generation_options = {
                max_images: sequentialImageGenerationOptions.maxImages,
              }
            }
          }

          // Add optimize prompt options
          if (optimizePromptOptions?.mode) {
            requestBody.optimize_prompt_options = {
              mode: optimizePromptOptions.mode,
            }
          }

          // Make HTTP request with timeout
          const response = await fetch(`${env.SEEDREAM_BASE_URL}/images/generations`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${env.SEEDREAM_API_KEY}`,
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          })

          clearTimeout(timeoutId)

          // Handle non-OK responses
          if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`API error ${response.status}: ${errorText}`)
          }

          // Parse response
          const result: APIResponse = await response.json()

          // Extract all image URLs (sequential mode may return multiple)
          const imageUrls =
            result.data?.map((item) => item.url).filter((url): url is string => !!url) || []

          if (imageUrls.length === 0) {
            throw new Error('No image URLs in response')
          }

          logger.info(
            `Batch ${index + 1}: Generated ${imageUrls.length} image(s) successfully (attempt ${attempt})`
          )

          return {
            urls: imageUrls,
            index,
            success: true,
            attempts: attempt,
          }
        } catch (error) {
          clearTimeout(timeoutId)
          throw error
        }
      } finally {
        // Always release semaphore permit
        semaphore.release()
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      logger.warn(
        { error: lastError, attempt, index: index + 1 },
        `Batch ${index + 1}: Attempt ${attempt} failed`
      )

      // Don't retry if it's the last attempt
      if (attempt >= CONFIG.MAX_RETRIES) {
        break
      }

      // Don't retry if error is not retryable
      if (!isRetryableError(error)) {
        logger.info(`Batch ${index + 1}: Non-retryable error, aborting`)
        break
      }

      // Wait before retry with exponential backoff + jitter
      const delay = calculateRetryDelay(attempt)
      logger.info(`Batch ${index + 1}: Retrying in ${delay}ms...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  // All retries failed
  return {
    urls: [],
    index,
    success: false,
    error: lastError?.message || 'Unknown error',
    attempts: CONFIG.MAX_RETRIES,
  }
}

// ============================================================================
// Main Generation Functions
// ============================================================================

/**
 * Generate multiple batches with detailed error tracking
 *
 * This is the main entry point for image generation.
 *
 * Features:
 * - Global semaphore controls total concurrent requests to Volcengine
 * - Per-batch retry with exponential backoff
 * - Supports sequential mode (multiple images per batch)
 * - Partial success support (some batches fail, some succeed)
 * - Detailed error tracking
 *
 * Concurrency is controlled by GLOBAL_API_CONCURRENCY (default: 300)
 * All batches are launched simultaneously but the semaphore limits actual concurrency
 *
 * @example
 * const result = await generateImagesDetailed({
 *   userPrompt: "A cute cat",
 *   imageCount: 4,  // 4 batches
 *   sequentialImageGeneration: 'auto',
 *   sequentialImageGenerationOptions: { maxImages: 5 }  // up to 5 images per batch
 * })
 * console.log(`Generated ${result.successCount} total images from ${imageCount} batches`)
 *
 * @param options - Generation options
 * @returns Detailed generation results including successes and failures
 */
export async function generateImagesDetailed(
  options: GenerateImagesOptions
): Promise<GenerateImagesResult> {
  const {
    userPrompt,
    templatePrompt,
    originalImageUrls,
    imageCount = CONFIG.DEFAULT_IMAGE_COUNT,
    size = CONFIG.DEFAULT_SIZE,
    sequentialImageGeneration = 'disabled',
    sequentialImageGenerationOptions,
    optimizePromptOptions,
    watermark = false,
    timeout = CONFIG.TIMEOUT_SECONDS,
  } = options

  const semaphore = getGlobalApiSemaphore()
  const hasMultipleImages = originalImageUrls && originalImageUrls.length > 1
  const isSequentialMode = sequentialImageGeneration === 'auto'

  logger.info(
    `Starting generation: ${imageCount} batches (global concurrency: ${semaphore.max}, multi-image: ${hasMultipleImages}, sequential: ${isSequentialMode})`
  )
  if (hasMultipleImages && isSequentialMode) {
    logger.info(
      `Multi-image + Sequential mode: each batch may produce multiple images from multiple reference images`
    )
  }

  // Render final prompt from template
  const prompt = await renderPrompt(userPrompt, templatePrompt)
  logger.info(`Prompt: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`)

  // Create generation tasks - all launched simultaneously
  // The global semaphore inside generateSingleImage controls actual concurrency
  const tasks = Array.from({ length: imageCount }, (_, index) =>
    generateSingleImage(prompt, {
      originalImageUrls,
      size,
      sequentialImageGeneration,
      sequentialImageGenerationOptions,
      optimizePromptOptions,
      watermark,
      timeout,
      index,
    })
  )

  // Execute all tasks - semaphore controls actual concurrency
  const results = await Promise.all(tasks)

  // Flatten results: each batch may have produced multiple images
  const successUrls: string[] = []
  const failures: Array<{ index: number; error: string; attempts: number }> = []

  results.forEach((result) => {
    if (result.success && result.urls.length > 0) {
      successUrls.push(...result.urls)
    } else {
      failures.push({
        index: result.index,
        error: result.error || 'Unknown error',
        attempts: result.attempts || 0,
      })
    }
  })

  const totalImagesGenerated = successUrls.length

  logger.info(
    `Completed: ${totalImagesGenerated} images generated from ${imageCount} batches (${results.filter((r) => r.success).length} successful batches)`
  )

  if (failures.length > 0) {
    logger.warn({ failures }, `${failures.length} batches failed`)
  }

  return {
    successUrls,
    failures,
    totalRequested: imageCount,
    successCount: totalImagesGenerated,
  }
}

/**
 * Generate images from text prompt
 *
 * Convenience wrapper for text-to-image generation.
 *
 * @param userPrompt - Text prompt for image generation
 * @param imageCount - Number of batches to generate
 * @returns Array of generated image URLs
 * @throws Error if all batches fail to generate
 */
export async function generateFromText(userPrompt: string, imageCount?: number): Promise<string[]> {
  const result = await generateImagesDetailed({
    userPrompt,
    imageCount,
  })

  if (result.successCount === 0) {
    throw new Error('All image generation attempts failed')
  }

  return result.successUrls
}

/**
 * Generate images from single or multiple original images
 *
 * Convenience wrapper for image-to-image or multi-image fusion generation.
 *
 * @param originalImageUrls - URLs of the original image(s)
 * @param userPrompt - Text prompt for transformation
 * @param options - Optional template and image count
 * @returns Array of generated image URLs
 * @throws Error if all batches fail to generate
 */
export async function generateFromImages(
  originalImageUrls: string[],
  userPrompt: string,
  options?: {
    templatePrompt?: string
    imageCount?: number
  }
): Promise<string[]> {
  const result = await generateImagesDetailed({
    originalImageUrls,
    userPrompt,
    templatePrompt: options?.templatePrompt,
    imageCount: options?.imageCount,
  })

  if (result.successCount === 0) {
    throw new Error('All image generation attempts failed')
  }

  return result.successUrls
}
