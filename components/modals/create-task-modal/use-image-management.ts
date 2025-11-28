/**
 * Create Task Modal - Image Management Hook
 *
 * 图片管理自定义Hook
 * 负责处理图片上传、预览、VLM分析等所有图片相关逻辑
 */

import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'

import { MAX_IMAGES } from './constants'
import { UseImageManagementProps, UseImageManagementReturn, VLMAnalysisResult } from './types'

/**
 * 图片管理Hook
 *
 * @description
 * 提供完整的图片管理功能，包括：
 * - 图片上传（支持单图/多图模式）
 * - 图片预览和删除
 * - VLM智能分析（仅单图模式）
 * - 拖拽上传
 *
 * @param props - Hook配置参数
 * @returns 图片管理的状态和操作方法
 */
export function useImageManagement({
  taskName,
  isImageTask,
  isTextTask,
  setValue,
  isModalActive,
}: UseImageManagementProps): UseImageManagementReturn {
  // ==================== 状态管理 ====================

  /** 图片预览URL列表 */
  const [previewUrls, setPreviewUrls] = useState<string[]>([])

  /** 已选择的文件列表 */
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])

  /** 图片输入模式（单图/多图） */
  const [imageInputMode, setImageInputMode] = useState<'single' | 'multi'>('single')

  /** 是否正在分析图片 */
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  /** 文件输入ref */
  const fileInputRef = useRef<HTMLInputElement>(null)

  /** VLM分析运行ID（用于取消过期的分析请求） */
  const analysisRunIdRef = useRef(0)

  // ==================== 工具函数 ====================

  /**
   * 清理所有预览URL
   * 释放内存以避免内存泄漏
   */
  const cleanupPreview = useCallback(() => {
    setPreviewUrls((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url))
      return []
    })
  }, [])

  // ==================== VLM图片分析 ====================

  /**
   * 使用VLM分析图片内容
   * 仅在单图模式下可用
   *
   * @param file - 要分析的图片文件
   *
   * @description
   * 1. 上传图片到服务器
   * 2. 调用VLM API分析图片内容
   * 3. 自动填充分析结果到表单
   * 4. 支持取消过期的分析请求
   */
  const analyzeImage = useCallback(
    async (file: File) => {
      // 验证任务名称
      if (!taskName || taskName.trim().length === 0) {
        toast.error('请先输入任务名称')
        return
      }

      // 多图模式下不启用VLM分析
      if (imageInputMode === 'multi') {
        return
      }

      // 生成新的运行ID，用于识别和取消过期请求
      const runId = ++analysisRunIdRef.current
      setIsAnalyzing(true)

      try {
        // 构建上传请求
        const formData = new FormData()
        formData.append('image', file)
        formData.append('taskName', taskName)

        toast.info('正在上传图片并分析...')

        // 调用上传API
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })

        const result = await response.json()

        // 检查响应是否成功
        if (!result.success) {
          throw new Error(result.error || 'Upload failed')
        }

        // 检查请求是否已过期或模态框已关闭
        if (!isModalActive || runId !== analysisRunIdRef.current) {
          return
        }

        // 更新表单数据
        setValue('existingImageUrls', result.imageUrl, { shouldValidate: true })
        setValue('userPrompt', result.analysis || '', {
          shouldDirty: true,
          shouldValidate: isTextTask,
        })
        toast.success('图片分析完成！')
      } catch (error) {
        console.error('VLM analysis failed:', error)

        // 只在请求未过期且模态框仍打开时显示错误
        if (runId === analysisRunIdRef.current && isModalActive) {
          toast.error('图片分析失败：' + (error instanceof Error ? error.message : '未知错误'))
          setValue('userPrompt', '图片分析失败，请手动输入描述...', {
            shouldDirty: true,
          })
        }
      } finally {
        // 只在当前请求未被取消时更新状态
        if (runId === analysisRunIdRef.current) {
          setIsAnalyzing(false)
        }
      }
    },
    [imageInputMode, isModalActive, isTextTask, setValue, taskName]
  )

  // ==================== 图片文件管理 ====================

  /**
   * 添加图片文件到列表
   *
   * @param files - 要添加的文件数组
   *
   * @description
   * 单图模式：替换现有图片，自动触发VLM分析
   * 多图模式：追加图片（最多10张），不触发分析
   */
  const addImageFiles = useCallback(
    async (files: File[]) => {
      if (imageInputMode === 'single') {
        // ===== 单图模式：替换现有图片 =====
        if (files.length > 0) {
          const file = files[0]
          const newUrl = URL.createObjectURL(file)

          // 清理旧图片预览URL
          cleanupPreview()

          // 更新状态
          setSelectedFiles([file])
          setPreviewUrls([newUrl])
          setValue('existingImageUrls', '', { shouldValidate: true })
          setValue('hasLocalImage', true, { shouldValidate: true })

          // 触发VLM分析（仅图生图任务）
          if (isImageTask) {
            await analyzeImage(file)
          }
        }
      } else {
        // ===== 多图模式：追加图片 =====
        const remainingSlots = MAX_IMAGES - selectedFiles.length

        // 检查是否已达上限
        if (remainingSlots <= 0) {
          toast.error(`最多支持上传 ${MAX_IMAGES} 张图片`)
          return
        }

        // 截取可添加的文件
        const filesToAdd = files.slice(0, remainingSlots)
        const newFiles = [...selectedFiles, ...filesToAdd]
        const newUrls = filesToAdd.map((file) => URL.createObjectURL(file))

        // 更新状态
        setSelectedFiles(newFiles)
        setPreviewUrls((prev) => [...prev, ...newUrls])
        setValue('existingImageUrls', '', { shouldValidate: true })
        setValue('hasLocalImage', true, { shouldValidate: true })

        // 提示被忽略的文件
        if (filesToAdd.length < files.length) {
          toast.warning(
            `已添加 ${filesToAdd.length} 张图片，剩余图片已忽略（最多${MAX_IMAGES}张）`
          )
        }
      }
    },
    [analyzeImage, cleanupPreview, imageInputMode, isImageTask, selectedFiles, setValue]
  )

  // ==================== 事件处理器 ====================

  /**
   * 处理文件输入变化事件
   * 响应用户通过文件选择器选择图片
   */
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files || files.length === 0) return

      // 验证任务名称
      if (!taskName.trim()) {
        toast.error('请先输入任务名称')
        return
      }

      await addImageFiles(Array.from(files))
    },
    [addImageFiles, taskName]
  )

  /**
   * 处理拖拽上传事件
   * 自动过滤非图片文件
   */
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()

      // 只保留图片文件
      const files = Array.from(e.dataTransfer.files).filter((file) =>
        file.type.startsWith('image/')
      )

      if (files.length === 0) {
        return
      }

      // 验证任务名称
      if (!taskName.trim()) {
        toast.error('请先输入任务名称')
        return
      }

      await addImageFiles(files)
    },
    [addImageFiles, taskName]
  )

  // ==================== 图片操作 ====================

  /**
   * 移除指定索引的图片
   *
   * @param index - 要移除的图片索引
   *
   * @description
   * - 释放预览URL内存
   * - 更新文件列表
   * - 单图模式下会清空提示词
   */
  const removeImage = useCallback(
    (index: number) => {
      // 清理预览URL
      setPreviewUrls((prev) => {
        const url = prev[index]
        if (url) URL.revokeObjectURL(url)
        return prev.filter((_, i) => i !== index)
      })

      // 更新文件列表
      setSelectedFiles((prev) => {
        const newFiles = prev.filter((_, i) => i !== index)

        // 如果全部清空
        if (newFiles.length === 0) {
          setValue('hasLocalImage', false, { shouldValidate: true })

          // 单图模式下清空提示词
          if (imageInputMode === 'single') {
            setValue('userPrompt', '', { shouldDirty: true })
          }

          // 重置文件输入
          if (fileInputRef.current) {
            fileInputRef.current.value = ''
          }
        }

        return newFiles
      })
    },
    [imageInputMode, setValue]
  )

  /**
   * 清空所有图片
   * 同时清空表单相关字段
   */
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

  /**
   * 重置所有图片相关状态
   * 用于模态框关闭时的清理
   */
  const resetImageState = useCallback(() => {
    cleanupPreview()
    setSelectedFiles([])
    setIsAnalyzing(false)
    setImageInputMode('single')

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [cleanupPreview])

  /**
   * 取消当前的VLM分析
   * 通过递增运行ID使当前请求失效
   */
  const cancelAnalysis = useCallback(() => {
    analysisRunIdRef.current += 1
  }, [])

  // ==================== 返回值 ====================

  return {
    // ===== 状态 =====
    /** 图片预览URL列表 */
    previewUrls,
    /** 已选择的文件列表 */
    selectedFiles,
    /** 图片输入模式（单图/多图） */
    imageInputMode,
    /** 是否正在分析图片 */
    isAnalyzing,
    /** 文件输入ref */
    fileInputRef,
    /** 是否有已选择的图片 */
    hasImages: selectedFiles.length > 0,

    // ===== 操作方法 =====
    /** 设置图片输入模式 */
    setImageInputMode,
    /** 添加图片文件 */
    addImageFiles,
    /** 处理文件选择 */
    handleFileChange,
    /** 处理拖放 */
    handleDrop,
    /** 移除指定索引的图片 */
    removeImage,
    /** 清空所有图片 */
    clearAllImages,
    /** 重置图片状态 */
    resetImageState,
    /** 分析图片（VLM） */
    analyzeImage,
    /** 取消分析 */
    cancelAnalysis,
  }
}
