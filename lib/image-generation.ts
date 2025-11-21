/**
 * Image Generation Service
 *
 * Enterprise-grade image generation with:
 * - Rate limiting to prevent 429 errors
 * - Exponential backoff retry with jitter
 * - Real timeout control with AbortController
 * - Concurrent request management
 * - Detailed error tracking
 *
 * Uses Seedream4.0 via Volcengine ARK API
 */

import { Liquid } from 'liquidjs'

import { env } from '@/lib/env'
import { logger as baseLogger } from '@/lib/logger'

const logger = baseLogger.child({ module: 'lib/image-generation' })

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
  /** Rate limit: max requests per time window */
  RATE_LIMIT_MAX_REQUESTS: 20,
  /** Rate limit: time window in ms */
  RATE_LIMIT_WINDOW_MS: 1000,
} as const

// ============================================================================
// Types
// ============================================================================

export interface GenerateImagesOptions {
  /** Original image URL (for image-to-image) */
  originalImageUrl?: string
  /** User custom prompt */
  userPrompt: string
  /** Template prompt with {{ prompt }} placeholder */
  templatePrompt?: string
  /** Number of images to generate */
  imageCount?: number
  /** Image size (e.g., "1024x1024", "2048x2048", or "2k") */
  size?: string
  /** Timeout per image in seconds */
  timeout?: number
  /** Maximum concurrent requests */
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
// Rate Limiter (Token Bucket Algorithm)
// ============================================================================

/**
 * Token bucket rate limiter to prevent API rate limit errors (429)
 *
 * Ensures requests are spread over time instead of bursting.
 * Example: 200 requests spread over 10 seconds instead of instant burst.
 */
class RateLimiter {
  private tokens: number
  private lastRefill: number

  constructor(
    private maxTokens: number,
    private refillInterval: number // ms
  ) {
    this.tokens = maxTokens
    this.lastRefill = Date.now()
  }

  /**
   * Wait until a token is available, then consume it
   */
  async acquire(): Promise<void> {
    while (true) {
      this.refill()

      if (this.tokens >= 1) {
        this.tokens -= 1
        return
      }

      // Wait for next refill opportunity
      const waitTime = Math.min(100, this.refillInterval / this.maxTokens)
      await new Promise((resolve) => setTimeout(resolve, waitTime))
    }
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now()
    const elapsed = now - this.lastRefill

    if (elapsed >= this.refillInterval) {
      const tokensToAdd = Math.floor(elapsed / this.refillInterval) * this.maxTokens
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd)
      this.lastRefill = now
    }
  }

  /**
   * Create a rate limiter from requests per time window
   *
   * @param maxRequests - Maximum requests allowed per window
   * @param windowMs - Time window in milliseconds
   */
  static fromRequestsPerWindow(maxRequests: number, windowMs: number): RateLimiter {
    return new RateLimiter(maxRequests, windowMs)
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
 * Generate a single image with timeout, retry, and error handling
 *
 * Features:
 * - AbortController for real timeout control
 * - Exponential backoff with jitter
 * - Smart retry (only retryable errors)
 * - Rate limiting via rateLimiter
 *
 * @param prompt - Final rendered prompt
 * @param options - Generation options
 * @returns Generated image result
 */
async function generateSingleImage(
  prompt: string,
  options: {
    originalImageUrl?: string
    size: string
    timeout: number
    index: number
    rateLimiter: RateLimiter
  }
): Promise<GeneratedImage> {
  const { originalImageUrl, size, timeout, index, rateLimiter } = options
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
    try {
      logger.info(`Image ${index + 1}: Attempt ${attempt}/${CONFIG.MAX_RETRIES}`)

      // Wait for rate limiter token
      await rateLimiter.acquire()

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
          n: 1,
          watermark: false,
        }

        // Add original image for image-to-image
        if (originalImageUrl) {
          requestBody.image = [originalImageUrl]
          requestBody.sequential_image_generation = 'auto'
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

        // Extract image URL
        const imageUrl = result.data?.[0]?.url
        if (!imageUrl) {
          throw new Error('No image URL in response')
        }

        logger.info(`Image ${index + 1}: Generated successfully (attempt ${attempt})`)

        return {
          url: imageUrl,
          index,
          success: true,
          attempts: attempt,
        }
      } catch (error) {
        clearTimeout(timeoutId)
        throw error
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      logger.warn(
        { error: lastError, attempt, index: index + 1 },
        `Image ${index + 1}: Attempt ${attempt} failed`
      )

      // Don't retry if it's the last attempt
      if (attempt >= CONFIG.MAX_RETRIES) {
        break
      }

      // Don't retry if error is not retryable
      if (!isRetryableError(error)) {
        logger.info(`Image ${index + 1}: Non-retryable error, aborting`)
        break
      }

      // Wait before retry with exponential backoff + jitter
      const delay = calculateRetryDelay(attempt)
      logger.info(`Image ${index + 1}: Retrying in ${delay}ms...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  // All retries failed
  return {
    url: '',
    index,
    success: false,
    error: lastError?.message || 'Unknown error',
    attempts: CONFIG.MAX_RETRIES,
  }
}

// ============================================================================
// Concurrent Execution with Limit
// ============================================================================

/**
 * Execute tasks with concurrency limit using worker pool pattern
 *
 * @param tasks - Array of async task functions
 * @param concurrency - Maximum concurrent tasks
 * @returns Array of results in same order as tasks
 */
async function parallelLimit<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let index = 0

  const worker = async (): Promise<void> => {
    while (index < tasks.length) {
      const currentIndex = index++
      results[currentIndex] = await tasks[currentIndex]()
    }
  }

  // Create worker pool with specified concurrency
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker())

  await Promise.all(workers)

  return results
}

// ============================================================================
// Main Generation Functions
// ============================================================================

/**
 * Generate multiple images with detailed error tracking
 *
 * This is the main entry point for image generation.
 *
 * Features:
 * - Concurrent generation with configurable limit
 * - Rate limiting to prevent 429 errors
 * - Per-image retry with exponential backoff
 * - Partial success support (some images fail, some succeed)
 * - Detailed error tracking
 *
 * @example
 * const result = await generateImagesDetailed({
 *   userPrompt: "A cute cat",
 *   imageCount: 10,
 *   concurrency: 5
 * })
 * console.log(`Generated ${result.successCount}/${result.totalRequested} images`)
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
    originalImageUrl,
    imageCount = CONFIG.DEFAULT_IMAGE_COUNT,
    size = CONFIG.DEFAULT_SIZE,
    timeout = CONFIG.TIMEOUT_SECONDS,
    concurrency = env.SEEDREAM_CONCURRENCY,
  } = options

  logger.info(`Starting generation: ${imageCount} images (concurrency: ${concurrency})`)

  // Render final prompt from template
  const prompt = await renderPrompt(userPrompt, templatePrompt)
  logger.info(`Prompt: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`)

  // Create rate limiter to prevent 429 errors
  // Default: 20 requests per second
  const rateLimiter = RateLimiter.fromRequestsPerWindow(
    CONFIG.RATE_LIMIT_MAX_REQUESTS,
    CONFIG.RATE_LIMIT_WINDOW_MS
  )

  // Create generation tasks
  const tasks = Array.from({ length: imageCount }, (_, index) => () =>
    generateSingleImage(prompt, {
      originalImageUrl,
      size,
      timeout,
      index,
      rateLimiter,
    })
  )

  // Execute with concurrency control
  const results = await parallelLimit(tasks, concurrency)

  // Separate successes and failures
  const successfulResults = results.filter((r) => r.success)
  const failedResults = results.filter((r) => !r.success)

  const successUrls = successfulResults.map((r) => r.url)
  const failures = failedResults.map((r) => ({
    index: r.index,
    error: r.error || 'Unknown error',
    attempts: r.attempts || 0,
  }))

  logger.info(`Completed: ${successfulResults.length}/${imageCount} images succeeded`)

  if (failures.length > 0) {
    logger.warn({ failures }, `${failures.length} images failed`)
  }

  return {
    successUrls,
    failures,
    totalRequested: imageCount,
    successCount: successfulResults.length,
  }
}

/**
 * Generate images from text prompt
 *
 * Convenience wrapper for text-to-image generation.
 *
 * @param userPrompt - Text prompt for image generation
 * @param imageCount - Number of images to generate
 * @returns Array of generated image URLs
 * @throws Error if all images fail to generate
 */
export async function generateFromText(
  userPrompt: string,
  imageCount?: number
): Promise<string[]> {
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
 * Generate images from image with prompt (image-to-image)
 *
 * Convenience wrapper for image-to-image generation.
 *
 * @param originalImageUrl - URL of the original image
 * @param userPrompt - Text prompt for transformation
 * @param options - Optional template and image count
 * @returns Array of generated image URLs
 * @throws Error if all images fail to generate
 */
export async function generateFromImage(
  originalImageUrl: string,
  userPrompt: string,
  options?: {
    templatePrompt?: string
    imageCount?: number
  }
): Promise<string[]> {
  const result = await generateImagesDetailed({
    originalImageUrl,
    userPrompt,
    templatePrompt: options?.templatePrompt,
    imageCount: options?.imageCount,
  })

  if (result.successCount === 0) {
    throw new Error('All image generation attempts failed')
  }

  return result.successUrls
}