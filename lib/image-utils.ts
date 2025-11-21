/**
 * Image Processing Utilities
 *
 * Handles image format conversion and optimization
 */

import sharp from 'sharp'

/**
 * Convert any image buffer to JPEG format
 *
 * This ensures compatibility with APIs that only support JPG/PNG
 * and provides consistent format across the application.
 *
 * @param buffer - Input image buffer (any format supported by sharp)
 * @param quality - JPEG quality (1-100, default: 90)
 * @returns JPEG image buffer
 */
export async function convertToJpeg(buffer: Buffer, quality: number = 90): Promise<Buffer> {
  try {
    return await sharp(buffer)
      .jpeg({ quality, mozjpeg: true }) // Use mozjpeg for better compression
      .toBuffer()
  } catch (error) {
    console.error('[ImageUtils] JPEG conversion failed:', error)
    throw new Error('Failed to convert image to JPEG format')
  }
}

/**
 * Get image metadata (dimensions, format, size)
 *
 * @param buffer - Image buffer
 * @returns Image metadata
 */
export async function getImageMetadata(buffer: Buffer) {
  try {
    const metadata = await sharp(buffer).metadata()
    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      size: metadata.size,
    }
  } catch (error) {
    console.error('[ImageUtils] Failed to read image metadata:', error)
    throw new Error('Failed to read image metadata')
  }
}