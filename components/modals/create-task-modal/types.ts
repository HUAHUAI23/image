/**
 * Create Task Modal - Type Definitions
 *
 * 统一管理创建任务模态框相关的所有类型定义
 */

import { UseFormSetValue } from 'react-hook-form'

import { CreateTaskFormValues } from '@/lib/validations/task'

// ==================== 基础类型 ====================

/**
 * 图片输入模式
 * - single: 单图模式（支持VLM分析）
 * - multi: 多图模式（批量上传）
 */
export type ImageInputMode = 'single' | 'multi'

/**
 * 提示词模板
 */
export interface PromptTemplate {
  id: number
  name: string
  content: string
  category: string
}

// ==================== 组件Props ====================

/**
 * 创建任务模态框主组件的Props
 */
export interface CreateTaskModalProps {
  /** 模态框是否打开 */
  open: boolean
  /** 模态框打开/关闭状态改变回调 */
  onOpenChange: (open: boolean) => void
  /** 任务创建成功回调 */
  onSuccess?: () => void
}

/**
 * 图片模式切换组件的Props
 */
export interface ImageModeToggleProps {
  /** 当前模式 */
  mode: ImageInputMode
  /** 模式改变回调 */
  onModeChange: (mode: ImageInputMode) => void
  /** 切换到单图模式时的回调（用于清理多余图片） */
  onSwitchToSingle?: () => void
}

/**
 * 动画标签组件的Props
 */
export interface AnimatedLabelProps {
  /** 子元素 */
  children: React.ReactNode
  /** 动画key（用于触发动画） */
  animationKey: string
}

// ==================== Hook相关类型 ====================

/**
 * useImageManagement Hook 的参数
 */
export interface UseImageManagementProps {
  /** 任务名称（用于VLM分析） */
  taskName: string
  /** 是否为图生图任务 */
  isImageTask: boolean
  /** 是否为文生图任务 */
  isTextTask: boolean
  /** React Hook Form 的 setValue 函数 */
  setValue: UseFormSetValue<CreateTaskFormValues>
  /** 模态框是否处于激活状态 */
  isModalActive: boolean
}

/**
 * useImageManagement Hook 的返回值
 */
export interface UseImageManagementReturn {
  // ========== 状态 ==========
  /** 图片预览URL列表 */
  previewUrls: string[]
  /** 已选择的文件列表 */
  selectedFiles: File[]
  /** 图片输入模式 */
  imageInputMode: ImageInputMode
  /** 是否正在分析图片 */
  isAnalyzing: boolean
  /** 文件输入ref */
  fileInputRef: React.RefObject<HTMLInputElement | null>
  /** 是否有已选择的图片 */
  hasImages: boolean

  // ========== 操作方法 ==========
  /** 设置图片输入模式 */
  setImageInputMode: (mode: ImageInputMode) => void
  /** 添加图片文件 */
  addImageFiles: (files: File[]) => Promise<void>
  /** 处理文件选择 */
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>
  /** 处理拖放 */
  handleDrop: (e: React.DragEvent) => Promise<void>
  /** 移除指定索引的图片 */
  removeImage: (index: number) => void
  /** 清空所有图片 */
  clearAllImages: () => void
  /** 重置图片状态 */
  resetImageState: () => void
  /** 分析图片（VLM） */
  analyzeImage: (file: File) => Promise<void>
  /** 取消分析 */
  cancelAnalysis: () => void
}

// ==================== VLM分析相关 ====================

/**
 * VLM图片分析结果
 */
export interface VLMAnalysisResult {
  success: boolean
  imageUrl?: string
  analysis?: string
  error?: string
}
