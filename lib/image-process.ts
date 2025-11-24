/**
 * Image Processing Utilities for TOS (Object Storage)
 *
 * Provides utilities for building TOS image processing parameters
 * and applying them to image URLs.
 *
 * TOS Image Processing Documentation:
 * https://www.volcengine.com/docs/6349/104712
 */

export interface ImageProcessConfig {
  /** 缩放模式 */
  mode: 'lfit' | 'mfit' | 'fill' | 'pad' | 'fixed' | null
  /** 目标宽度 (1-16384) */
  width: number | null
  /** 目标高度 (1-16384) */
  height: number | null
  /** 长边 (1-16384) */
  longEdge: number | null
  /** 短边 (1-16384) */
  shortEdge: number | null
  /** 百分比缩放 (1-1000) */
  percentage: number | null
  /** 限制放大: 1=禁止放大, 0=允许放大 */
  limit: 0 | 1
  /** 填充颜色，十六进制，如 "FFFFFF" (pad 模式使用) */
  color: string
  /** 压缩格式 */
  compress: 'none' | 'webp' | 'jpg' | 'heic'
  /** 图片质量 (1-100) */
  quality: number | null
}

export const DEFAULT_IMAGE_PROCESS_CONFIG: ImageProcessConfig = {
  mode: null,
  width: null,
  height: null,
  longEdge: null,
  shortEdge: null,
  percentage: null,
  limit: 1,
  color: 'FFFFFF',
  compress: 'none',
  quality: null,
}

/**
 * Build TOS image processing query string
 *
 * @param config - Image processing configuration
 * @returns Query string like "image/resize,w_800,h_600,m_lfit"
 *
 * @example
 * buildProcessQuery({ width: 800, height: 600, mode: 'lfit' })
 * // Returns: "image/resize,w_800,h_600,m_lfit"
 */
export function buildProcessQuery(config: ImageProcessConfig): string {
  const parts: string[] = []
  const resizeParts: string[] = []

  // Add resize parameters
  if (config.width) resizeParts.push(`w_${config.width}`)
  if (config.height) resizeParts.push(`h_${config.height}`)
  if (config.longEdge) resizeParts.push(`l_${config.longEdge}`)
  if (config.shortEdge) resizeParts.push(`s_${config.shortEdge}`)
  if (config.percentage) resizeParts.push(`p_${config.percentage}`)
  if (config.mode) resizeParts.push(`m_${config.mode}`)
  if (config.limit !== 1) resizeParts.push(`limit_${config.limit}`)
  if (config.color && config.mode === 'pad') resizeParts.push(`color_${config.color}`)

  if (resizeParts.length > 0) {
    parts.push('image/resize,' + resizeParts.join(','))
  }

  // Add format conversion
  if (config.compress && config.compress !== 'none') {
    if (config.compress === 'heic') {
      // HEIC uses special slim parameter
      parts.push('slim,zlevel_6')
    } else if (config.compress === 'webp') {
      parts.push('image/format,webp')
    } else if (config.compress === 'jpg') {
      parts.push('image/format,jpg')
    }
  }

  // Add quality parameter (for WebP and JPG)
  if (config.quality && (config.compress === 'webp' || config.compress === 'jpg')) {
    parts.push(`image/quality,q_${config.quality}`)
  }

  return parts.join('/')
}

/**
 * Apply image processing parameters to URL
 *
 * @param url - Original image URL
 * @param config - Image processing configuration
 * @returns URL with processing parameters
 *
 * @example
 * applyProcessToUrl('https://example.com/image.jpg', { width: 800 })
 * // Returns: "https://example.com/image.jpg?x-tos-process=image/resize,w_800"
 */
export function applyProcessToUrl(url: string, config: ImageProcessConfig): string {
  const processQuery = buildProcessQuery(config)
  if (!processQuery) return url

  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}x-tos-process=${processQuery}`
}

/**
 * Get file extension based on compression format
 *
 * @param compress - Compression format
 * @param defaultExt - Default extension if no compression
 * @returns File extension (without dot)
 */
export function getFileExtension(
  compress: ImageProcessConfig['compress'],
  defaultExt = 'png'
): string {
  if (compress === 'webp') return 'webp'
  if (compress === 'jpg') return 'jpg'
  if (compress === 'heic') return 'heic'
  return defaultExt
}
