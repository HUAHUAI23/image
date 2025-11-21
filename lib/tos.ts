/**
 * Volcengine TOS (Object Storage) Service
 *
 * Handles file uploads to Volcengine TOS with automatic path organization
 */

import { TosClient, ACLType } from '@volcengine/tos-sdk'
import { env } from './env'
import { convertToJpeg } from './image-utils'

// Initialize TOS Client
const tosClient = new TosClient({
  accessKeyId: env.VOLCENGINE_ACCESS_KEY,
  accessKeySecret: env.VOLCENGINE_SECRET_KEY,
  region: env.VOLCENGINE_REGION,
  endpoint: env.VOLCENGINE_ENDPOINT,
})

const bucketName = env.VOLCENGINE_BUCKET_NAME

/**
 * Upload file to TOS
 *
 * @param buffer - File buffer to upload
 * @param filename - Original filename
 * @param taskName - Task name (used as folder prefix)
 * @param folder - Subfolder name (e.g., "originalImage", "generatedImage")
 * @returns Public URL of the uploaded file
 */
export async function uploadToTOS(
  buffer: Buffer,
  filename: string,
  taskName: string,
  folder: 'originalImage' | 'generatedImage'
): Promise<string> {
  // Convert image to JPEG format for API compatibility
  const jpegBuffer = await convertToJpeg(buffer)

  // Clean task name (remove special characters)
  const cleanTaskName = taskName.replace(/[^\w\-]/g, '_')

  // Replace file extension with .jpg
  const jpegFilename = filename.replace(/\.[^.]+$/, '.jpg')

  // Build object key: taskName/folder/filename
  const objectKey = `${cleanTaskName}/${folder}/${jpegFilename}`

  // Upload to TOS with public-read ACL
  await tosClient.putObject({
    bucket: bucketName,
    key: objectKey,
    body: jpegBuffer,
    acl: ACLType.ACLPublicRead, // Set public read ACL
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
 * @param taskName - Task name (used as folder prefix)
 * @param folder - Subfolder name
 * @returns Public URL of the uploaded file
 */
export async function uploadFileToTOS(
  file: File,
  taskName: string,
  folder: 'originalImage' | 'generatedImage'
): Promise<string> {
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const filename = `${Date.now()}-${file.name}`

  return uploadToTOS(buffer, filename, taskName, folder)
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

  await tosClient.deleteObject({
    bucket: bucketName,
    key: objectKey,
  })
}
