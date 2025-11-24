/**
 * Batch Download Utilities with ZIP Support
 *
 * Provides utilities for downloading multiple images and packaging them into a ZIP file.
 */

import JSZip from 'jszip'

import { applyProcessToUrl, getFileExtension, ImageProcessConfig } from './image-process'

export interface DownloadProgress {
  /** 当前下载的索引 */
  current: number
  /** 总数 */
  total: number
  /** 当前正在下载的文件名 */
  filename: string
  /** 下载阶段 */
  stage: 'downloading' | 'zipping' | 'complete'
}

export interface BatchDownloadResult {
  /** 成功数量 */
  successCount: number
  /** 失败数量 */
  failCount: number
  /** 失败的索引列表 */
  failedIndices: number[]
}

/**
 * Download a single image with processing
 *
 * @param url - Image URL
 * @param config - Image processing config
 * @returns Image blob
 */
async function downloadImage(url: string, config: ImageProcessConfig): Promise<Blob> {
  const finalUrl = applyProcessToUrl(url, config)
  const downloadUrl = `/api/download?url=${encodeURIComponent(finalUrl)}`
  const response = await fetch(downloadUrl)

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`)
  }

  return response.blob()
}

/**
 * Batch download images and package into ZIP
 *
 * @param images - Array of image URLs
 * @param indices - Indices of images to download
 * @param config - Image processing config
 * @param taskId - Task ID for filename
 * @param taskName - Task name for ZIP filename
 * @param onProgress - Progress callback
 * @returns Download result
 */
export async function batchDownloadAsZip(
  images: string[],
  indices: number[],
  config: ImageProcessConfig,
  taskId: number,
  taskName: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<BatchDownloadResult> {
  const zip = new JSZip()
  const ext = getFileExtension(config.compress)

  let successCount = 0
  let failCount = 0
  const failedIndices: number[] = []

  // Download all images concurrently with limited concurrency
  const CONCURRENCY = 5
  const total = indices.length

  for (let i = 0; i < indices.length; i += CONCURRENCY) {
    const batch = indices.slice(i, Math.min(i + CONCURRENCY, indices.length))

    const results = await Promise.allSettled(
      batch.map(async (index) => {
        const filename = `image-${index + 1}.${ext}`

        onProgress?.({
          current: i + batch.indexOf(index) + 1,
          total,
          filename,
          stage: 'downloading',
        })

        const blob = await downloadImage(images[index], config)
        return { index, filename, blob }
      })
    )

    // Process results
    results.forEach((result, batchIndex) => {
      const index = batch[batchIndex]
      if (result.status === 'fulfilled') {
        zip.file(result.value.filename, result.value.blob)
        successCount++
      } else {
        failCount++
        failedIndices.push(index)
        console.error(`Failed to download image ${index}:`, result.reason)
      }
    })
  }

  // Generate ZIP
  onProgress?.({
    current: total,
    total,
    filename: 'Generating ZIP...',
    stage: 'zipping',
  })

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  // Download ZIP
  const sanitizedTaskName = taskName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5-_]/g, '_')
  const zipFilename = `${sanitizedTaskName}-task${taskId}-${Date.now()}.zip`
  const link = document.createElement('a')
  link.href = URL.createObjectURL(zipBlob)
  link.download = zipFilename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href)

  onProgress?.({
    current: total,
    total,
    filename: zipFilename,
    stage: 'complete',
  })

  return { successCount, failCount, failedIndices }
}

/**
 * Download a single image (without ZIP)
 *
 * @param url - Image URL
 * @param index - Image index
 * @param taskId - Task ID
 * @param config - Image processing config (optional)
 */
export async function downloadSingleImage(
  url: string,
  index: number,
  taskId: number,
  config?: ImageProcessConfig
): Promise<void> {
  const blob = await downloadImage(url, config || { compress: 'none' } as ImageProcessConfig)
  const ext = config ? getFileExtension(config.compress) : 'png'
  const filename = `task-${taskId}-image-${index + 1}.${ext}`

  const blobUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(blobUrl)
}
