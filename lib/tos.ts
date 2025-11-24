/**
 * Volcengine TOS (Object Storage) Service
 *
 * Handles file uploads to Volcengine TOS with structured path organization
 *
 * Path Structure:
 * - Original images: originalImage/{userId}/{taskId}/filename.jpg
 * - Generated images: generatedImage/{userId}/{taskId}/filename.jpg
 * - Temporary uploads: originalImage/{userId}/temp-{timestamp}/filename.jpg
 */

import { ACLType,TosClient } from '@volcengine/tos-sdk'

import { env } from './env'
import { convertToJpeg } from './image-utils'

// Lazy initialization of TOS Client (prevents initialization at build time)
let tosClient: TosClient | null = null

function getTosClient(): TosClient {
  if (!tosClient) {
    tosClient = new TosClient({
      accessKeyId: env.VOLCENGINE_ACCESS_KEY,
      accessKeySecret: env.VOLCENGINE_SECRET_KEY,
      region: env.VOLCENGINE_REGION,
      endpoint: env.VOLCENGINE_ENDPOINT,
    })
  }
  return tosClient
}

const bucketName = env.VOLCENGINE_BUCKET_NAME

/**
 * Upload file to TOS with structured path
 *
 * @param buffer - File buffer to upload
 * @param filename - Original filename
 * @param userId - User ID for path organization
 * @param taskId - Task ID for path organization (optional for temporary uploads)
 * @param folder - Folder type: "originalImage" or "generatedImage"
 * @returns Public URL of the uploaded file
 */
export async function uploadToTOS(
  buffer: Buffer,
  filename: string,
  userId: number,
  taskId: number | string,
  folder: 'originalImage' | 'generatedImage'
): Promise<string> {
  // Convert image to JPEG format for API compatibility
  const jpegBuffer = await convertToJpeg(buffer)

  // Replace file extension with .jpg
  const jpegFilename = filename.replace(/\.[^.]+$/, '.jpg')

  // Build object key: folder/userId/taskId/filename
  // Example: originalImage/123/456/image.jpg or originalImage/123/temp-1234567890/image.jpg
  const objectKey = `${folder}/${userId}/${taskId}/${jpegFilename}`

  // Upload to TOS with public-read ACL
  await getTosClient().putObject({
    bucket: bucketName,
    key: objectKey,
    body: jpegBuffer,
    acl: ACLType.ACLPublicRead,
  })

  // Return public URL
  // Format: https://{bucket}.{endpoint}/{objectKey}
  const publicUrl = `https://${bucketName}.${env.VOLCENGINE_ENDPOINT}/${objectKey}`

  return publicUrl
}

/**
 * Upload file from File object
 *
 * @param file - File object from form upload
 * @param userId - User ID
 * @param taskId - Task ID (or temp identifier)
 * @param folder - Folder type
 * @returns Public URL of the uploaded file
 */
export async function uploadFileToTOS(
  file: File,
  userId: number,
  taskId: number | string,
  folder: 'originalImage' | 'generatedImage'
): Promise<string> {
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const filename = `${Date.now()}-${file.name}`

  return uploadToTOS(buffer, filename, userId, taskId, folder)
}

/**
 * Upload file to temporary location (before task is created)
 *
 * @param file - File object from form upload
 * @param userId - User ID
 * @returns Public URL of the uploaded file
 */
export async function uploadFileToTempTOS(file: File, userId: number): Promise<string> {
  const tempId = `temp-${Date.now()}`
  return uploadFileToTOS(file, userId, tempId, 'originalImage')
}

/**
 * Delete file from TOS
 *
 * @param url - Full URL of the file to delete
 */
export async function deleteFromTOS(url: string): Promise<void> {
  // Extract object key from URL
  const urlObj = new URL(url)
  const objectKey = urlObj.pathname.substring(1) // Remove leading slash

  await getTosClient().deleteObject({
    bucket: bucketName,
    key: objectKey,
  })
}