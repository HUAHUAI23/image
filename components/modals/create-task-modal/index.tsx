'use client'

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Controller, FieldErrors, Resolver, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Image as ImageIcon,
  Layers,
  Loader2,
  Sparkles,
  Trash2,
  Type,
  UploadCloud,
  Wand2,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'

import { getPricesAction } from '@/app/actions/task'
import { getPromptTemplatesAction } from '@/app/actions/template'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/animate-ui/components/animate/tooltip'
import { Dialog, DialogContent, DialogTitle } from '@/components/animate-ui/components/radix/dialog'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/animate-ui/components/radix/hover-card'
import { Switch } from '@/components/animate-ui/components/radix/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/animate-ui/components/radix/tabs'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useIsMobile } from '@/hooks/use-mobile'
import { formatCurrency } from '@/lib/const'
import { cn } from '@/lib/utils'
import {
  createTaskFormSchema,
  CreateTaskFormValues,
  DEFAULT_IMAGE_NUMBER,
  DEFAULT_SEQUENTIAL_MODE,
  DEFAULT_SIZE,
  DEFAULT_TASK_TYPE,
  DEFAULT_TEMPLATE_ID,
} from '@/lib/validations/task'

import { IMAGE_ACCEPT_TYPES, MAX_IMAGES } from './constants'
import { useImageManagement } from './use-image-management'

type Template = {
  id: number
  name: string
  content: string
  category: string
}

interface CreateTaskModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

// ========== Local Helper Components ==========

/** Animated label component for smooth text transitions */
function AnimatedLabel({ children, animationKey }: { children: ReactNode; animationKey: string }) {
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={animationKey}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.2 }}
      >
        {children}
      </motion.span>
    </AnimatePresence>
  )
}

/** Animated unit label for batch/image count */
function AnimatedUnit({ children, animationKey }: { children: ReactNode; animationKey: string }) {
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={animationKey}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.15 }}
        className="text-sm text-muted-foreground"
      >
        {children}
      </motion.span>
    </AnimatePresence>
  )
}

/** Image mode toggle with animated background */
interface ImageModeToggleProps {
  mode: 'single' | 'multi'
  onModeChange: (mode: 'single' | 'multi') => void
  onSwitchToSingle?: () => void
}

function ImageModeToggle({ mode, onModeChange, onSwitchToSingle }: ImageModeToggleProps) {
  return (
    <div className="relative grid grid-cols-2 p-1 bg-muted/50 rounded-lg border">
      {/* Animated Background Highlight */}
      <motion.div
        className="absolute inset-1 bg-background rounded-md shadow-sm border border-transparent dark:border-input dark:bg-input/30"
        initial={false}
        animate={{ x: mode === 'single' ? '0%' : '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={{ width: 'calc(50% - 4px)' }}
      />

      <button
        type="button"
        onClick={() => {
          if (mode !== 'single') {
            onSwitchToSingle?.()
            onModeChange('single')
          }
        }}
        className={cn(
          'relative z-10 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-colors duration-300',
          mode === 'single' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <ImageIcon className="w-3.5 h-3.5" />
        单图模式
      </button>

      <button
        type="button"
        onClick={() => onModeChange('multi')}
        className={cn(
          'relative z-10 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-colors duration-300',
          mode === 'multi' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <Layers className="w-3.5 h-3.5" />
        多图模式
      </button>
    </div>
  )
}

export function CreateTaskModal({ open, onOpenChange, onSuccess }: CreateTaskModalProps) {
  const {
    control,
    handleSubmit,
    register,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateTaskFormValues>({
    resolver: zodResolver(createTaskFormSchema) as Resolver<CreateTaskFormValues>,
    defaultValues: {
      type: DEFAULT_TASK_TYPE,
      name: '',
      userPrompt: '',
      templateId: DEFAULT_TEMPLATE_ID,
      imageNumber: DEFAULT_IMAGE_NUMBER,
      existingImageUrls: '',
      hasLocalImage: false,
      generationOptions: {
        size: DEFAULT_SIZE,
        sequentialImageGeneration: DEFAULT_SEQUENTIAL_MODE,
        sequentialImageGenerationOptions: {
          maxImages: undefined,
        },
        watermark: false,
        optimizePromptOptions: {
          mode: 'standard',
        },
      },
    },
  })

  const [templates, setTemplates] = useState<Template[]>([])
  const [prices, setPrices] = useState<any[]>([])
  const isMobile = useIsMobile()
  const TitleComponent = isMobile ? DrawerTitle : DialogTitle
  const isModalActiveRef = useRef(open)

  // Watch form values
  const normalizedType = watch('type') || DEFAULT_TASK_TYPE
  const taskName = watch('name')
  const imageNumber = watch('imageNumber')
  const generationOptions = watch('generationOptions')
  const sequentialMode = watch('generationOptions.sequentialImageGeneration')
  const maxImages = watch('generationOptions.sequentialImageGenerationOptions.maxImages')

  // Computed values
  const isImageTask = normalizedType === 'image_to_image'
  const isTextTask = normalizedType === 'text_to_image'
  const isSequentialMode = sequentialMode === 'auto'

  // Use image management hook
  const imageManagement = useImageManagement({
    taskName,
    isImageTask,
    isTextTask,
    setValue,
    isModalActive: isModalActiveRef.current,
  })

  const {
    previewUrls,
    selectedFiles,
    imageInputMode,
    isAnalyzing,
    fileInputRef,
    hasImages,
    setImageInputMode,
    handleFileChange,
    handleDrop,
    removeImage,
    clearAllImages,
    resetImageState,
    cancelAnalysis,
    analyzeImage,
  } = imageManagement
  // Handle task type change
  const handleTypeChange = useCallback(
    (nextType: string) => {
      const safeType: CreateTaskFormValues['type'] =
        nextType === 'text_to_image'
          ? 'text_to_image'
          : nextType === 'image_to_image'
            ? 'image_to_image'
            : DEFAULT_TASK_TYPE
      setValue('type', safeType, { shouldValidate: true, shouldDirty: true })
    },
    [setValue]
  )

  // Handle switching to single mode
  const handleSwitchToSingle = useCallback(() => {
    if (selectedFiles.length > 1) {
      const firstFile = selectedFiles[0]
      // Cleanup other preview URLs
      previewUrls.slice(1).forEach((url) => URL.revokeObjectURL(url))

      // This will be handled by the hook, but we trigger analysis here
      if (isImageTask && firstFile) {
        analyzeImage(firstFile)
      }
    }
  }, [analyzeImage, isImageTask, previewUrls, selectedFiles])

  // Unified form reset function
  const resetForm = useCallback(() => {
    reset({
      type: DEFAULT_TASK_TYPE,
      name: '',
      userPrompt: '',
      templateId: DEFAULT_TEMPLATE_ID,
      imageNumber: DEFAULT_IMAGE_NUMBER,
      existingImageUrls: '',
      hasLocalImage: false,
      generationOptions: {
        size: DEFAULT_SIZE,
        sequentialImageGeneration: DEFAULT_SEQUENTIAL_MODE,
        sequentialImageGenerationOptions: {
          maxImages: undefined,
        },
        watermark: false,
        optimizePromptOptions: {
          mode: 'standard',
        },
      },
    })
    resetImageState()
  }, [reset, resetImageState])

  // Load templates and prices when modal opens
  useEffect(() => {
    if (open) {
      getPromptTemplatesAction().then(setTemplates)
      getPricesAction().then(setPrices)
    }
  }, [open])

  const perImagePrice = useMemo(() => {
    return (
      prices.find((p) => p.taskType === normalizedType && p.priceUnit === 'per_image')?.price || 0
    )
  }, [prices, normalizedType])

  // 计算预期生成的图片数量（用于预付费）
  const expectedImageCount = useMemo(() => {
    if (sequentialMode === 'auto') {
      const perBatchMax = maxImages || 15
      return imageNumber * perBatchMax
    } else {
      return imageNumber
    }
  }, [imageNumber, sequentialMode, maxImages])

  // 计算预估费用
  const estimatedCost = useMemo(() => {
    return perImagePrice * expectedImageCount
  }, [perImagePrice, expectedImageCount])

  // Reset form when modal closes and prevent stale async updates
  useEffect(() => {
    isModalActiveRef.current = open
    if (!open) {
      cancelAnalysis()
      resetForm()
    }
  }, [cancelAnalysis, open, resetForm])

  const onSubmit = useCallback(
    async (values: CreateTaskFormValues) => {
      try {
        const payload = new FormData()
        payload.append('type', values.type)
        payload.append('name', values.name)
        if (values.userPrompt) {
          payload.append('userPrompt', values.userPrompt)
        }
        if (values.templateId && values.templateId !== DEFAULT_TEMPLATE_ID) {
          payload.append('templateId', values.templateId)
        }
        payload.append('imageNumber', values.imageNumber.toString())
        if (values.existingImageUrls) {
          payload.append('existingImageUrls', values.existingImageUrls)
        }
        // 添加所有选中的图片
        if (selectedFiles.length > 0) {
          selectedFiles.forEach((file, index) => {
            payload.append(`image_${index}`, file)
          })
          payload.append('imageCount', selectedFiles.length.toString())
        }
        // 添加生成选项
        if (values.generationOptions) {
          payload.append('generationOptions', JSON.stringify(values.generationOptions))
        }

        const response = await fetch('/api/tasks', {
          method: 'POST',
          body: payload,
        })

        const result = await response.json()

        if (!response.ok || !result.success) {
          throw new Error(result.message || '创建任务失败')
        }

        toast.success('任务创建成功')
        resetForm()
        onOpenChange(false)
        onSuccess?.()
      } catch (error) {
        console.error('Create task failed:', error)
        toast.error(error instanceof Error ? error.message : '创建任务失败')
      }
    },
    [onOpenChange, onSuccess, resetForm, selectedFiles]
  )

  const onInvalid = useCallback((formErrors: FieldErrors<CreateTaskFormValues>) => {
    let message: string | null = null
    for (const error of Object.values(formErrors)) {
      if (
        error &&
        typeof error === 'object' &&
        'message' in error &&
        typeof error.message === 'string'
      ) {
        message = error.message
        break
      }
    }
    toast.error(message || '表单校验失败')
  }, [])

  const modalBody = (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="flex flex-col h-full">
      {/* Header Area */}
      <div
        className={cn(
          'flex items-center justify-between px-6 py-4 border-b shrink-0 relative bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60',
          isMobile && 'flex-col items-start gap-4 px-4 py-3'
        )}
      >
        <TitleComponent className="text-lg font-medium">创建新任务</TitleComponent>

        {/* Centered Tabs */}
        <div
          className={cn(
            'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
            isMobile && 'relative left-0 top-0 translate-x-0 translate-y-0 w-full'
          )}
        >
          <Tabs
            value={normalizedType}
            onValueChange={handleTypeChange}
            className={cn('w-[280px]', isMobile && 'w-full')}
          >
            <TabsList className="grid w-full grid-cols-2 h-9 bg-muted/50">
              <TabsTrigger value="text_to_image" className="text-xs font-medium flex items-center gap-2">
                <Type className="w-3.5 h-3.5" />
                文生图
              </TabsTrigger>
              <TabsTrigger value="image_to_image" className="text-xs font-medium flex items-center gap-2">
                <ImageIcon className="w-3.5 h-3.5" />
                图生图
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Spacer for Close Button */}
        <div className={cn('w-8', isMobile && 'hidden')} />
      </div>

      <div className={cn('flex flex-1', isMobile ? 'flex-col overflow-y-auto' : 'overflow-hidden')}>
        {/* Main Content: Inputs */}
        {/* Left Side Wrapper */}
        <div className="flex-1 flex flex-col min-h-0 bg-background">
          <div
            className={cn(
              'flex-1 flex flex-col gap-6',
              isMobile ? 'p-4 overflow-y-auto' : 'p-8 overflow-y-auto'
            )}
          >
            {/* Task Name */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                任务名称
                <span className="text-xs text-destructive">*</span>
              </Label>
              <Input
                {...register('name')}
                placeholder="例如: 产品宣传图-金融风格"
                className="h-11 text-base shadow-sm transition-shadow focus:shadow-md"
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            {/* User Prompt */}
            <div className="space-y-2 flex-1 flex flex-col">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <AnimatedLabel animationKey={isImageTask ? 'image-desc' : 'text-prompt'}>
                    {isImageTask ? '图片描述 (可修改)' : '提示词'}
                  </AnimatedLabel>
                  {isTextTask && <span className="text-xs text-destructive">*</span>}
                </Label>
                {isAnalyzing && (
                  <span className="text-xs text-muted-foreground animate-pulse flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> 分析中...
                  </span>
                )}
              </div>
              <Textarea
                {...register('userPrompt')}
                key={`prompt-${normalizedType}`}
                placeholder={
                  isImageTask
                    ? '上传图片后自动分析，也可手动编辑...'
                    : '请输入生成图片的描述，越详细越好...'
                }
                className={cn(
                  'flex-1 min-h-[200px] resize-none text-base leading-relaxed shadow-sm transition-all focus:shadow-md p-4',
                  isMobile && 'min-h-40'
                )}
                disabled={isAnalyzing}
              />
              {errors.userPrompt && (
                <p className="text-xs text-destructive">{errors.userPrompt.message}</p>
              )}
            </div>

            {/* Settings Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Image Number (Moved here) */}
              <div className="flex flex-col space-y-3">
                <Label className="text-sm font-medium text-foreground/80">
                  <AnimatedLabel animationKey={isSequentialMode ? 'batch-count' : 'image-count'}>
                    {isSequentialMode ? '批次数量' : '生成数量'}
                  </AnimatedLabel>
                </Label>
                <div className="flex items-center gap-2">
                  {[1, 4, 8].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setValue('imageNumber', num, { shouldValidate: true })}
                      className={cn(
                        'flex-1 h-10 rounded-md border text-sm font-medium transition-all duration-200',
                        imageNumber === num
                          ? 'border-primary bg-primary/5 text-primary shadow-sm'
                          : 'border-border hover:border-primary/50 hover:bg-muted/50 text-muted-foreground'
                      )}
                    >
                      {num}
                    </button>
                  ))}
                  <div className="relative w-20">
                    <Input
                      type="number"
                      min={1}
                      max={500}
                      value={imageNumber}
                      onChange={(e) => {
                        const value = parseInt(e.target.value, 10)
                        const normalized = Number.isNaN(value) ? DEFAULT_IMAGE_NUMBER : value
                        const clampedValue = Math.max(1, Math.min(500, normalized))
                        setValue('imageNumber', clampedValue, {
                          shouldValidate: true,
                          shouldDirty: true,
                        })
                      }}
                      className="h-10 text-center px-2 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                      <AnimatedUnit animationKey={isSequentialMode ? 'unit-batch' : 'unit-image'}>
                        {isSequentialMode ? '批' : '张'}
                      </AnimatedUnit>
                    </span>
                  </div>
                </div>
                <div className="h-5 flex items-start">
                  {errors.imageNumber && (
                    <p className="text-xs text-destructive leading-5">{errors.imageNumber.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium text-foreground/80">图片尺寸</Label>
                <Controller
                  name="generationOptions.size"
                  control={control}
                  render={({ field }) => {
                    const sizes = [
                      { value: '1K', label: '1K', desc: '智能尺寸' },
                      { value: '2K', label: '2K', desc: '智能尺寸' },
                      { value: '4K', label: '4K', desc: '智能尺寸' },
                      { value: '2048x2048', label: '1:1', desc: '2048×2048' },
                      { value: '2560x1440', label: '16:9', desc: '2560×1440' },
                      { value: '1440x2560', label: '9:16', desc: '1440×2560' },
                      { value: '2304x1728', label: '4:3', desc: '2304×1728' },
                      { value: '1728x2304', label: '3:4', desc: '1728×2304' },
                    ]

                    return (
                      <div className="grid grid-cols-4 gap-2">
                        <TooltipProvider openDelay={0}>
                          {sizes.map((size) => (
                            <Tooltip key={size.value} side="top">
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => field.onChange(size.value)}
                                  className={cn(
                                    'flex flex-col items-center justify-center p-2 rounded-lg border transition-all duration-200',
                                    field.value === size.value
                                      ? 'border-foreground bg-foreground text-background shadow-sm'
                                      : 'border-border hover:border-primary/50 hover:bg-muted/50 text-muted-foreground'
                                  )}
                                >
                                  <span className="text-xs font-medium">{size.label}</span>
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">
                                <p>{size.desc}</p>
                              </TooltipContent>
                            </Tooltip>
                          ))}
                        </TooltipProvider>
                      </div>
                    )
                  }}
                />
              </div>
            </div>

            {/* Style Template and Sequential Mode */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Style Template (Moved here) */}
              <div className="space-y-3">
                <Label className="text-sm font-medium text-foreground/80">风格模板</Label>
                <Controller
                  name="templateId"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="h-11 w-full shadow-sm">
                        <SelectValue placeholder="选择风格模板..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={DEFAULT_TEMPLATE_ID}>不使用模板 (默认)</SelectItem>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id.toString()}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.templateId && (
                  <p className="text-xs text-destructive">{errors.templateId.message}</p>
                )}
              </div>

              <div className="flex flex-col space-y-3">
                <div className="flex items-center justify-between h-5">
                  <Label className="text-sm font-medium text-foreground/80">组图模式</Label>
                  <TooltipProvider>
                    <Tooltip side="top">
                      <TooltipTrigger asChild>
                        <div className="cursor-help text-muted-foreground hover:text-foreground transition-colors">
                          <Sparkles className="w-3.5 h-3.5" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>开启后 AI 将根据提示词智能生成一组关联图片</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                <Controller
                  name="generationOptions.sequentialImageGeneration"
                  control={control}
                  render={({ field }) => (
                    <div className="flex items-center gap-3 h-10 p-1">
                      <Switch
                        checked={field.value === 'auto'}
                        onCheckedChange={(checked) => field.onChange(checked ? 'auto' : 'disabled')}
                      />
                      <span className="text-sm text-muted-foreground">
                        {field.value === 'auto' ? '已开启' : '已关闭'}
                      </span>
                    </div>
                  )}
                />

                <AnimatePresence>
                  {isSequentialMode && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-2 space-y-2">
                        <Label className="text-xs font-medium text-muted-foreground">
                          每批最多生成 (可选)
                        </Label>
                        <Controller
                          name="generationOptions.sequentialImageGenerationOptions.maxImages"
                          control={control}
                          render={({ field }) => {
                            const currentValue = field.value?.toString() || 'auto'
                            return (
                              <Select
                                value={currentValue}
                                onValueChange={(v) =>
                                  field.onChange(v === 'auto' ? undefined : parseInt(v))
                                }
                              >
                                <SelectTrigger className="h-9 w-full shadow-sm bg-background">
                                  <SelectValue placeholder="选择最大数量">
                                    {currentValue === 'auto'
                                      ? '由 AI 决定 (最多15张)'
                                      : `最多 ${field.value} 张`}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="auto">由 AI 决定 (最多15张)</SelectItem>
                                  {[3, 5, 8, 10, 12, 15].map((n) => (
                                    <SelectItem key={n} value={n.toString()}>
                                      最多 {n} 张
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )
                          }}
                        />
                        <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                          ⚠️ 开启后每批可能生成多张关联图片
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Advanced Options - Tiled Design */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-foreground/80">提示词优化</Label>
              <Controller
                name="generationOptions.optimizePromptOptions.mode"
                control={control}
                render={({ field }) => (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => field.onChange('standard')}
                      className={cn(
                        'flex flex-col items-start p-3 rounded-lg border text-left transition-all duration-200',
                        field.value === 'standard' || !field.value
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border hover:border-primary/50 hover:bg-muted/50'
                      )}
                    >
                      <span className={cn("text-sm font-medium mb-1", (field.value === 'standard' || !field.value) ? "text-primary" : "text-foreground")}>
                        标准模式
                      </span>
                      <span className="text-[10px] text-muted-foreground leading-relaxed">
                        生成质量更高，细节更丰富，但耗时稍长
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => field.onChange('fast')}
                      className={cn(
                        'flex flex-col items-start p-3 rounded-lg border text-left transition-all duration-200',
                        field.value === 'fast'
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border hover:border-primary/50 hover:bg-muted/50'
                      )}
                    >
                      <span className={cn("text-sm font-medium mb-1", field.value === 'fast' ? "text-primary" : "text-foreground")}>
                        快速模式
                      </span>
                      <span className="text-[10px] text-muted-foreground leading-relaxed">
                        生成速度更快，适合快速验证创意
                      </span>
                    </button>
                  </div>
                )}
              />
            </div>

          </div>

        </div>

        {/* Right Sidebar: Reference Images */}
        <div
          className={cn(
            'border-l bg-muted/10 p-6 flex flex-col gap-4 shrink-0 transition-all duration-300 h-full',
            imageInputMode === 'single' ? 'overflow-hidden' : 'overflow-y-auto',
            isMobile ? 'w-full border-l-0 border-t p-4 h-auto' : 'w-[480px]'
          )}
        >
          <div className="flex flex-col gap-4 shrink-0">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-foreground/80 flex items-center gap-2">
                {isImageTask ? '参考图片' : '参考图片 (可选)'}
                {hasImages && imageInputMode === 'multi' && (
                  <span className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary rounded-full font-medium">
                    {selectedFiles.length} / {MAX_IMAGES}
                  </span>
                )}
              </Label>
              <div className="flex items-center gap-2">
                {hasImages && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearAllImages}
                    className="h-6 px-2 text-[10px] text-muted-foreground hover:text-destructive"
                  >
                    清空全部
                  </Button>
                )}
              </div>
            </div>

            <ImageModeToggle
              mode={imageInputMode}
              onModeChange={setImageInputMode}
              onSwitchToSingle={handleSwitchToSingle}
            />
          </div>

          {/* Image Upload Area */}
          <div
            className={cn(
              'flex flex-col gap-3',
              isMobile
                ? 'min-h-60'
                : imageInputMode === 'single'
                  ? 'flex-1 min-h-0'
                  : 'grow shrink-0'
            )}
          >
            <Input
              ref={fileInputRef}
              name="image"
              type="file"
              accept={IMAGE_ACCEPT_TYPES}
              multiple={imageInputMode === 'multi'}
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Multi-Image Mode with Images: Grid Layout including Add Button */}
            {imageInputMode === 'multi' && hasImages ? (
              <div className="grid grid-cols-2 gap-3 content-start pb-4">
                {previewUrls.map((url, index) => (
                  <div
                    key={index}
                    className="relative group rounded-xl overflow-hidden border border-border/50 bg-background aspect-square shadow-sm shrink-0 transition-all hover:shadow-md"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Preview ${index + 1}`}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />

                    {/* Floating Delete Button */}
                    <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 scale-90 group-hover:scale-100">
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="h-7 w-7 rounded-full bg-white/90 text-destructive hover:bg-destructive hover:text-white shadow-sm backdrop-blur-sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeImage(index)
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Index Badge */}
                    <div className="absolute bottom-1.5 left-1.5">
                      <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-black/60 text-white text-[10px] rounded-md font-medium backdrop-blur-sm">
                        {index + 1}
                      </span>
                    </div>
                  </div>
                ))}

                {/* Add Button Card */}
                {selectedFiles.length < MAX_IMAGES && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/15 hover:border-primary/50 bg-muted/20 hover:bg-muted/40 transition-all duration-300 aspect-square group shrink-0"
                  >
                    <div className="w-10 h-10 rounded-full bg-background shadow-sm border border-border/50 group-hover:border-primary/20 group-hover:scale-110 transition-all duration-300 flex items-center justify-center">
                      <UploadCloud className="w-5 h-5 text-muted-foreground/70 group-hover:text-primary transition-colors" />
                    </div>
                    <span className="text-xs text-muted-foreground/70 group-hover:text-primary/80 font-medium transition-colors">
                      继续添加
                    </span>
                  </button>
                )}
              </div>
            ) : (
              /* Empty State or Single Image Mode */
              <div
                className={cn(
                  'border-2 border-dashed rounded-xl relative group transition-all duration-200 shrink-0 overflow-hidden',
                  imageInputMode === 'single' && hasImages ? 'h-full border-none' : 'h-full',
                  !hasImages &&
                  'border-muted-foreground/20 hover:border-primary/50 hover:bg-muted/20',
                  isImageTask && !hasImages && 'border-destructive/20 bg-destructive/5',
                  !taskName.trim() ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                )}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => {
                  if (!taskName.trim()) {
                    toast.error('请先输入任务名称')
                    return
                  }
                  fileInputRef.current?.click()
                }}
              >
                {/* Single Image Preview Overlay */}
                {imageInputMode === 'single' && hasImages ? (
                  <div className="relative w-full h-full group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrls[0]}
                      alt="Preview"
                      className="w-full h-full object-cover rounded-xl"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100">
                      <p className="text-white font-medium text-sm mb-2">点击替换图片</p>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="h-8"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeImage(0)
                        }}
                      >
                        <Trash2 className="w-4 h-4 mr-1" /> 删除
                      </Button>
                    </div>
                    {isAnalyzing && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm rounded-xl">
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                          <p className="text-white/90 text-sm font-medium">智能分析中...</p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground p-4 text-center">
                    <div
                      className={cn(
                        'rounded-2xl flex items-center justify-center transition-colors',
                        hasImages ? 'w-10 h-10' : 'w-12 h-12',
                        isImageTask && !hasImages
                          ? 'bg-primary/5 text-primary'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      <UploadCloud className={cn(hasImages ? 'h-5 w-5' : 'h-6 w-6')} />
                    </div>
                    <div className="space-y-1">
                      {!taskName.trim() ? (
                        <>
                          <p className="font-medium text-sm">请先输入任务名称</p>
                          <p className="text-xs text-muted-foreground/60">输入后即可启用上传</p>
                        </>
                      ) : (
                        <>
                          <p className="font-medium text-foreground text-sm">
                            {imageInputMode === 'single' ? '点击或拖拽上传' : '点击或拖拽上传多张'}
                          </p>
                          <p className="text-xs text-muted-foreground/60">
                            {imageInputMode === 'single'
                              ? '支持 JPG, PNG, WEBP'
                              : `最多支持 ${MAX_IMAGES} 张`}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Helper Text */}
          {errors.existingImageUrls && (
            <p className="text-xs text-destructive px-1">{errors.existingImageUrls.message}</p>
          )}
          <div className="bg-muted/30 rounded-lg p-3 text-[11px] text-muted-foreground space-y-1.5 border border-border/50">
            {isImageTask ? (
              <>
                <p className="font-medium text-foreground/80">关于参考图：</p>
                <ul className="list-disc pl-3 space-y-0.5 opacity-80">
                  <li>上传的图片将作为生成新图片的基础参考</li>
                  {imageInputMode === 'multi' ? (
                    <li className="text-amber-600 dark:text-amber-400">
                      多图模式：已禁用智能分析，请手动输入描述
                    </li>
                  ) : hasImages ? (
                    <li className="text-primary/80">已自动分析图片内容，可手动修改描述</li>
                  ) : (
                    <li>单图模式支持 AI 智能分析图片内容</li>
                  )}
                </ul>
              </>
            ) : (
              <p>可选择上传图片作为风格或构图参考，留空则纯文本生成。</p>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        className={cn(
          'flex items-center justify-between gap-3 px-6 py-4 border-t bg-muted/5 shrink-0',
          isMobile && 'flex-col-reverse items-stretch gap-2 px-4 py-3'
        )}
      >
        {/* Price Summary (Left Side) */}
        <div className={cn("flex items-center gap-2", isMobile && "justify-between w-full")}>
          <HoverCard>
            <HoverCardTrigger asChild>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer group transition-all duration-300 hover:bg-muted/50 hover:scale-105 hover:shadow-md">
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors duration-200">
                      {isSequentialMode ? '预付费用' : '预计消耗'}
                    </span>
                    <motion.div
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                    >
                      <Sparkles className="w-3 h-3 text-muted-foreground/50 group-hover:text-primary transition-colors duration-200" />
                    </motion.div>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className={cn("text-xl font-bold tracking-tight transition-all duration-200", isSequentialMode ? "text-amber-600 dark:text-amber-500 group-hover:text-amber-500 dark:group-hover:text-amber-400" : "text-primary group-hover:text-primary/80")}>
                      {formatCurrency(estimatedCost)}
                    </span>
                  </div>
                </div>
                <div className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <div className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                </div>
              </div>
            </HoverCardTrigger>
            <HoverCardContent side="top" align="start" className="w-[280px] p-0 border-none shadow-xl bg-transparent">
              {/* Detailed Price Breakdown Card */}
              <motion.div
                className="w-full rounded-xl border bg-popover text-popover-foreground shadow-sm overflow-hidden"
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <div className="p-3 space-y-3">
                  <motion.div
                    className="flex items-center justify-between border-b pb-2"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05, duration: 0.2 }}
                  >
                    <span className="text-sm font-medium">费用明细</span>
                    <span className={cn("text-sm font-bold", isSequentialMode ? "text-amber-600" : "text-primary")}>
                      {formatCurrency(estimatedCost)}
                    </span>
                  </motion.div>

                  <motion.div
                    className="space-y-1.5"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1, duration: 0.2 }}
                  >
                    <motion.div
                      className="flex justify-between text-xs"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15, duration: 0.2 }}
                    >
                      <span className="text-muted-foreground">单张价格</span>
                      <span>{formatCurrency(perImagePrice)}</span>
                    </motion.div>

                    {!isSequentialMode ? (
                      <motion.div
                        className="flex justify-between text-xs"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2, duration: 0.2 }}
                      >
                        <span className="text-muted-foreground">生成数量</span>
                        <span>{imageNumber} 张</span>
                      </motion.div>
                    ) : (
                      <>
                        <motion.div
                          className="flex justify-between text-xs"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.2, duration: 0.2 }}
                        >
                          <span className="text-muted-foreground">批次数量</span>
                          <span>{imageNumber} 批</span>
                        </motion.div>
                        <motion.div
                          className="flex justify-between text-xs"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.25, duration: 0.2 }}
                        >
                          <span className="text-muted-foreground">每批上限</span>
                          <span>{generationOptions?.sequentialImageGenerationOptions?.maxImages || 15} 张</span>
                        </motion.div>
                      </>
                    )}

                    <motion.div
                      className="flex justify-between text-xs pt-1 border-t border-dashed mt-1"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3, duration: 0.2 }}
                    >
                      <span className="text-muted-foreground">计费公式</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {!isSequentialMode
                          ? `${imageNumber} × ${formatCurrency(perImagePrice)}`
                          : `${imageNumber} × ${generationOptions?.sequentialImageGenerationOptions?.maxImages || 15} × ${formatCurrency(perImagePrice)}`}
                      </span>
                    </motion.div>
                  </motion.div>
                </div>

                {isSequentialMode && (
                  <motion.div
                    className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/20 px-3 py-2.5 border-t border-amber-200 dark:border-amber-900/30"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35, duration: 0.3 }}
                  >
                    <div className="flex items-start gap-2">
                      <motion.span
                        className="text-amber-600 dark:text-amber-400 text-sm flex-shrink-0 mt-0.5"
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ delay: 0.4, type: "spring", stiffness: 200 }}
                      >
                        💡
                      </motion.span>
                      <div className="space-y-2">
                        <motion.p
                          className="text-[11px] text-amber-900 dark:text-amber-200 font-semibold leading-relaxed"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.45, duration: 0.2 }}
                        >
                          组图模式 · 预扣多退机制
                        </motion.p>

                        {/* 预扣费用计算 */}
                        <motion.div
                          className="space-y-1"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.5, duration: 0.2 }}
                        >
                          <p className="text-[10px] text-amber-800 dark:text-amber-300 font-medium">
                            ① 预扣费用（先冻结）
                          </p>
                          <div className="bg-amber-100/50 dark:bg-amber-900/20 rounded px-2 py-1.5 font-mono text-[10px] text-amber-900 dark:text-amber-200">
                            {imageNumber} 批 × {generationOptions?.sequentialImageGenerationOptions?.maxImages || 15} 张 × {formatCurrency(perImagePrice)} = <strong>{formatCurrency(estimatedCost)}</strong>
                          </div>
                        </motion.div>

                        {/* 实际费用计算示例 */}
                        <motion.div
                          className="space-y-1"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.55, duration: 0.2 }}
                        >
                          <p className="text-[10px] text-amber-800 dark:text-amber-300 font-medium">
                            ② 实际费用（按实际生成）
                          </p>
                          <div className="bg-amber-100/50 dark:bg-amber-900/20 rounded px-2 py-1.5 font-mono text-[10px] text-amber-900 dark:text-amber-200">
                            {imageNumber} 批 × <span className="text-amber-600 dark:text-amber-400 font-semibold">实际生成数</span> × {formatCurrency(perImagePrice)}
                          </div>
                        </motion.div>

                        {/* 退费计算示例 */}
                        <motion.div
                          className="space-y-1"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.6, duration: 0.2 }}
                        >
                          <p className="text-[10px] text-amber-800 dark:text-amber-300 font-medium">
                            ③ 自动退费（差额退回）
                          </p>
                          <div className="bg-green-100/50 dark:bg-green-900/20 rounded px-2 py-1.5 text-[10px]">
                            <div className="font-mono text-green-900 dark:text-green-200 mb-1">
                              退费 = 预扣 - 实际
                            </div>
                            <div className="text-green-800 dark:text-green-300 text-[9px]">
                              例：每批实际生成 {Math.ceil((generationOptions?.sequentialImageGenerationOptions?.maxImages || 15) * 0.6)} 张时，退还 <strong className="text-green-700 dark:text-green-400">{formatCurrency(imageNumber * ((generationOptions?.sequentialImageGenerationOptions?.maxImages || 15) - Math.ceil((generationOptions?.sequentialImageGenerationOptions?.maxImages || 15) * 0.6)) * perImagePrice)}</strong>
                            </div>
                          </div>
                        </motion.div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            </HoverCardContent>
          </HoverCard>
        </div>

        <div className={cn("flex items-center gap-3", isMobile && "w-full")}>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className={cn('h-10 px-6', isMobile && 'w-full')}
          >
            取消
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || isAnalyzing}
            className={cn(
              'h-10 px-8 min-w-[140px] shadow-lg shadow-primary/20 transition-all hover:shadow-primary/30',
              isMobile && 'w-full justify-center'
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <Wand2 className="mr-2 h-4 w-4" />
                立即生成
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  )

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="p-0 gap-0 overflow-hidden flex flex-col shadow-2xl bg-background h-[95vh] max-h-[95vh] rounded-t-3xl">
          {modalBody}
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1000px] p-0 gap-0 overflow-hidden flex flex-col shadow-2xl h-[85vh]">
        {modalBody}
      </DialogContent>
    </Dialog>
  )
}
