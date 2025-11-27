import { useCallback, useRef, useState } from 'react'
import { UseFormSetValue } from 'react-hook-form'
import { toast } from 'sonner'

import { CreateTaskFormValues } from '@/lib/validations/task'

import { MAX_IMAGES } from './constants'

interface UseImageManagementProps {
  taskName: string
  isImageTask: boolean
  isTextTask: boolean
  setValue: UseFormSetValue<CreateTaskFormValues>
  isModalActive: boolean
}

export function useImageManagement({
  taskName,
  isImageTask,
  isTextTask,
  setValue,
  isModalActive,
}: UseImageManagementProps) {
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [imageInputMode, setImageInputMode] = useState<'single' | 'multi'>('single')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const analysisRunIdRef = useRef(0)

  // Cleanup preview URLs
  const cleanupPreview = useCallback(() => {
    setPreviewUrls((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url))
      return []
    })
  }, [])

  // Analyze image with VLM (only for single image mode)
  const analyzeImage = useCallback(
    async (file: File) => {
      if (!taskName || taskName.trim().length === 0) {
        toast.error('请先输入任务名称')
        return
      }

      // 多图模式下不启用VLM分析
      if (imageInputMode === 'multi') {
        return
      }

      const runId = ++analysisRunIdRef.current
      setIsAnalyzing(true)
      try {
        const formData = new FormData()
        formData.append('image', file)
        formData.append('taskName', taskName)

        toast.info('正在上传图片并分析...')

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })

        const result = await response.json()

        if (!result.success) {
          throw new Error(result.error || 'Upload failed')
        }

        if (!isModalActive || runId !== analysisRunIdRef.current) {
          return
        }

        setValue('existingImageUrls', result.imageUrl, { shouldValidate: true })
        setValue('userPrompt', result.analysis || '', {
          shouldDirty: true,
          shouldValidate: isTextTask,
        })
        toast.success('图片分析完成！')
      } catch (error) {
        console.error('VLM analysis failed:', error)
        if (runId === analysisRunIdRef.current && isModalActive) {
          toast.error('图片分析失败：' + (error instanceof Error ? error.message : '未知错误'))
          setValue('userPrompt', '图片分析失败，请手动输入描述...', {
            shouldDirty: true,
          })
        }
      } finally {
        if (runId === analysisRunIdRef.current) {
          setIsAnalyzing(false)
        }
      }
    },
    [imageInputMode, isModalActive, isTextTask, setValue, taskName]
  )

  // Add image files to the list
  const addImageFiles = useCallback(
    async (files: File[]) => {
      if (imageInputMode === 'single') {
        // 单图模式：替换现有图片
        if (files.length > 0) {
          const file = files[0]
          const newUrl = URL.createObjectURL(file)

          // 清理旧图片
          cleanupPreview()

          setSelectedFiles([file])
          setPreviewUrls([newUrl])
          setValue('existingImageUrls', '', { shouldValidate: true })
          setValue('hasLocalImage', true, { shouldValidate: true })

          // 触发分析
          if (isImageTask) {
            await analyzeImage(file)
          }
        }
      } else {
        // 多图模式：追加图片
        const remainingSlots = MAX_IMAGES - selectedFiles.length
        if (remainingSlots <= 0) {
          toast.error(`最多支持上传 ${MAX_IMAGES} 张图片`)
          return
        }

        const filesToAdd = files.slice(0, remainingSlots)
        const newFiles = [...selectedFiles, ...filesToAdd]
        const newUrls = filesToAdd.map((file) => URL.createObjectURL(file))

        setSelectedFiles(newFiles)
        setPreviewUrls((prev) => [...prev, ...newUrls])
        setValue('existingImageUrls', '', { shouldValidate: true })
        setValue('hasLocalImage', true, { shouldValidate: true })

        if (filesToAdd.length < files.length) {
          toast.warning(
            `已添加 ${filesToAdd.length} 张图片，剩余图片已忽略（最多${MAX_IMAGES}张）`
          )
        }
      }
    },
    [analyzeImage, cleanupPreview, imageInputMode, isImageTask, selectedFiles, setValue]
  )

  // Handle file upload (supports multiple files)
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files || files.length === 0) return

      if (!taskName.trim()) {
        toast.error('请先输入任务名称')
        return
      }

      await addImageFiles(Array.from(files))
    },
    [addImageFiles, taskName]
  )

  // Handle drag and drop
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      const files = Array.from(e.dataTransfer.files).filter((file) =>
        file.type.startsWith('image/')
      )

      if (files.length === 0) {
        return
      }

      if (!taskName.trim()) {
        toast.error('请先输入任务名称')
        return
      }

      await addImageFiles(files)
    },
    [addImageFiles, taskName]
  )

  // Remove a specific image by index
  const removeImage = useCallback(
    (index: number) => {
      setPreviewUrls((prev) => {
        const url = prev[index]
        if (url) URL.revokeObjectURL(url)
        return prev.filter((_, i) => i !== index)
      })
      setSelectedFiles((prev) => {
        const newFiles = prev.filter((_, i) => i !== index)
        if (newFiles.length === 0) {
          setValue('hasLocalImage', false, { shouldValidate: true })
          // 只有在完全清空时才清空 prompt，或者在单图模式下被移除时
          if (imageInputMode === 'single') {
            setValue('userPrompt', '', { shouldDirty: true })
          }
          if (fileInputRef.current) {
            fileInputRef.current.value = ''
          }
        }
        return newFiles
      })
    },
    [imageInputMode, setValue]
  )

  // Clear all images
  const clearAllImages = useCallback(() => {
    cleanupPreview()
    setSelectedFiles([])
    setValue('existingImageUrls', '', { shouldValidate: true })
    setValue('hasLocalImage', false, { shouldValidate: true })
    setValue('userPrompt', '', { shouldDirty: true })

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [cleanupPreview, setValue])

  // Reset all image-related state
  const resetImageState = useCallback(() => {
    cleanupPreview()
    setSelectedFiles([])
    setIsAnalyzing(false)
    setImageInputMode('single')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [cleanupPreview])

  // Increment analysis run ID (for cancellation)
  const cancelAnalysis = useCallback(() => {
    analysisRunIdRef.current += 1
  }, [])

  return {
    // State
    previewUrls,
    selectedFiles,
    imageInputMode,
    isAnalyzing,
    fileInputRef,
    hasImages: selectedFiles.length > 0,

    // Actions
    setImageInputMode,
    addImageFiles,
    handleFileChange,
    handleDrop,
    removeImage,
    clearAllImages,
    resetImageState,
    analyzeImage,
    cancelAnalysis,
  }
}
