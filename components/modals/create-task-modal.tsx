'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Controller, FieldErrors, Resolver, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Image as ImageIcon,
  Layers,
  Loader2,
  Sparkles,
  Trash2,
  Type,
  UploadCloud,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';

import { getPricesAction } from '@/app/actions/task';
import { getPromptTemplatesAction } from '@/app/actions/template';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatCurrency } from '@/lib/const';
import { cn } from '@/lib/utils';
import {
  createTaskFormSchema,
  CreateTaskFormValues,
  DEFAULT_IMAGE_NUMBER,
  DEFAULT_SEQUENTIAL_MODE,
  DEFAULT_SIZE,
  DEFAULT_TASK_TYPE,
  DEFAULT_TEMPLATE_ID,
} from '@/lib/validations/task';

type Template = {
  id: number;
  name: string;
  content: string;
  category: string;
};

interface CreateTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
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
        watermark: false,
        optimizePromptOptions: {
          mode: 'standard',
        },
      },
    },
  });
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [imageInputMode, setImageInputMode] = useState<'single' | 'multi'>('single');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const MAX_IMAGES = 10; // 最多支持10张图片
  const [templates, setTemplates] = useState<Template[]>([]);
  const [prices, setPrices] = useState<any[]>([]);
  const isMobile = useIsMobile();
  const TitleComponent = isMobile ? DrawerTitle : DialogTitle;
  const isModalActiveRef = useRef(open);
  const analysisRunIdRef = useRef(0);
  const normalizedType = watch('type') || DEFAULT_TASK_TYPE;
  const taskName = watch('name');
  const imageNumber = watch('imageNumber');
  const generationOptions = watch('generationOptions');
  const sequentialMode = watch('generationOptions.sequentialImageGeneration');
  const maxImages = watch('generationOptions.sequentialImageGenerationOptions.maxImages');
  const isImageTask = normalizedType === 'image_to_image';
  const isTextTask = normalizedType === 'text_to_image';
  const isSequentialMode = sequentialMode === 'auto';
  const hasImages = selectedFiles.length > 0;
  const handleTypeChange = useCallback(
    (nextType: string) => {
      const safeType: CreateTaskFormValues['type'] =
        nextType === 'text_to_image'
          ? 'text_to_image'
          : nextType === 'image_to_image'
            ? 'image_to_image'
            : DEFAULT_TASK_TYPE;
      setValue('type', safeType, { shouldValidate: true, shouldDirty: true });
    },
    [setValue]
  );

  const cleanupPreview = useCallback(() => {
    setPreviewUrls((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return [];
    });
  }, []);

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
        watermark: false,
        optimizePromptOptions: {
          mode: 'standard',
        },
      },
    });
    cleanupPreview();
    setSelectedFiles([]);
    setIsAnalyzing(false);
    setImageInputMode('single');

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [cleanupPreview, reset]);

  // Analyze image with VLM (only for single image mode)
  const analyzeImage = useCallback(
    async (file: File) => {
      if (!taskName || taskName.trim().length === 0) {
        toast.error('请先输入任务名称');
        return;
      }

      // 多图模式下不启用VLM分析
      if (imageInputMode === 'multi') {
        return;
      }

      const runId = ++analysisRunIdRef.current;
      setIsAnalyzing(true);
      try {
        const formData = new FormData();
        formData.append('image', file);
        formData.append('taskName', taskName);

        toast.info('正在上传图片并分析...');

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Upload failed');
        }

        if (!isModalActiveRef.current || runId !== analysisRunIdRef.current) {
          return;
        }

        setValue('existingImageUrls', result.imageUrl, { shouldValidate: true });
        setValue('userPrompt', result.analysis || '', {
          shouldDirty: true,
          shouldValidate: isTextTask,
        });
        toast.success('图片分析完成！');
      } catch (error) {
        console.error('VLM analysis failed:', error);
        if (runId === analysisRunIdRef.current && isModalActiveRef.current) {
          toast.error('图片分析失败：' + (error instanceof Error ? error.message : '未知错误'));
          setValue('userPrompt', '图片分析失败，请手动输入描述...', {
            shouldDirty: true,
          });
        }
      } finally {
        if (runId === analysisRunIdRef.current) {
          setIsAnalyzing(false);
        }
      }
    },
    [imageInputMode, isTextTask, setValue, taskName]
  );

  // Add image files to the list
  const addImageFiles = useCallback(
    async (files: File[]) => {
      if (imageInputMode === 'single') {
        // 单图模式：替换现有图片
        if (files.length > 0) {
          const file = files[0];
          const newUrl = URL.createObjectURL(file);

          // 清理旧图片
          cleanupPreview();

          setSelectedFiles([file]);
          setPreviewUrls([newUrl]);
          setValue('existingImageUrls', '', { shouldValidate: true });
          setValue('hasLocalImage', true, { shouldValidate: true });

          // 触发分析
          if (isImageTask) {
            await analyzeImage(file);
          }
        }
      } else {
        // 多图模式：追加图片
        const remainingSlots = MAX_IMAGES - selectedFiles.length;
        if (remainingSlots <= 0) {
          toast.error(`最多支持上传 ${MAX_IMAGES} 张图片`);
          return;
        }

        const filesToAdd = files.slice(0, remainingSlots);
        const newFiles = [...selectedFiles, ...filesToAdd];
        const newUrls = filesToAdd.map((file) => URL.createObjectURL(file));

        setSelectedFiles(newFiles);
        setPreviewUrls((prev) => [...prev, ...newUrls]);
        setValue('existingImageUrls', '', { shouldValidate: true });
        setValue('hasLocalImage', true, { shouldValidate: true });

        if (filesToAdd.length < files.length) {
          toast.warning(
            `已添加 ${filesToAdd.length} 张图片，剩余图片已忽略（最多${MAX_IMAGES}张）`
          );
        }
      }
    },
    [analyzeImage, cleanupPreview, imageInputMode, isImageTask, selectedFiles, setValue]
  );

  // Handle file upload (supports multiple files)
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      if (!taskName.trim()) {
        toast.error('请先输入任务名称');
        return;
      }

      await addImageFiles(Array.from(files));
    },
    [addImageFiles, taskName]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files).filter((file) =>
        file.type.startsWith('image/')
      );

      if (files.length === 0) {
        return;
      }

      if (!taskName.trim()) {
        toast.error('请先输入任务名称');
        return;
      }

      await addImageFiles(files);
    },
    [addImageFiles, taskName]
  );

  // Remove a specific image by index
  const removeImage = useCallback(
    (index: number) => {
      setPreviewUrls((prev) => {
        const url = prev[index];
        if (url) URL.revokeObjectURL(url);
        return prev.filter((_, i) => i !== index);
      });
      setSelectedFiles((prev) => {
        const newFiles = prev.filter((_, i) => i !== index);
        if (newFiles.length === 0) {
          setValue('hasLocalImage', false, { shouldValidate: true });
          // 只有在完全清空时才清空 prompt，或者在单图模式下被移除时
          if (imageInputMode === 'single') {
            setValue('userPrompt', '', { shouldDirty: true });
          }
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }
        return newFiles;
      });
    },
    [imageInputMode, setValue]
  );

  // Clear all images
  const clearAllImages = useCallback(() => {
    cleanupPreview();
    setSelectedFiles([]);
    setValue('existingImageUrls', '', { shouldValidate: true });
    setValue('hasLocalImage', false, { shouldValidate: true });
    setValue('userPrompt', '', { shouldDirty: true });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [cleanupPreview, setValue]);

  // Load templates and prices when modal opens
  useEffect(() => {
    if (open) {
      getPromptTemplatesAction().then(setTemplates);
      getPricesAction().then(setPrices);
    }
  }, [open]);

  const perImagePrice = useMemo(() => {
    return (
      prices.find((p) => p.taskType === normalizedType && p.priceUnit === 'per_image')?.price || 0
    );
  }, [prices, normalizedType]);

  // 计算预期生成的图片数量（用于预付费）
  const expectedImageCount = useMemo(() => {
    if (sequentialMode === 'auto') {
      const perBatchMax = maxImages || 15;
      return imageNumber * perBatchMax;
    } else {
      return imageNumber;
    }
  }, [imageNumber, sequentialMode, maxImages]);

  // 计算预估费用
  const estimatedCost = useMemo(() => {
    return perImagePrice * expectedImageCount;
  }, [perImagePrice, expectedImageCount]);

  // Reset form when modal closes and prevent stale async updates
  useEffect(() => {
    isModalActiveRef.current = open;
    if (!open) {
      analysisRunIdRef.current += 1;
      resetForm();
    }
  }, [open, resetForm]);

  const onSubmit = useCallback(
    async (values: CreateTaskFormValues) => {
      try {
        const payload = new FormData();
        payload.append('type', values.type);
        payload.append('name', values.name);
        if (values.userPrompt) {
          payload.append('userPrompt', values.userPrompt);
        }
        if (values.templateId && values.templateId !== DEFAULT_TEMPLATE_ID) {
          payload.append('templateId', values.templateId);
        }
        payload.append('imageNumber', values.imageNumber.toString());
        if (values.existingImageUrls) {
          payload.append('existingImageUrls', values.existingImageUrls);
        }
        // 添加所有选中的图片
        if (selectedFiles.length > 0) {
          selectedFiles.forEach((file, index) => {
            payload.append(`image_${index}`, file);
          });
          payload.append('imageCount', selectedFiles.length.toString());
        }
        // 添加生成选项
        if (values.generationOptions) {
          payload.append('generationOptions', JSON.stringify(values.generationOptions));
        }

        const response = await fetch('/api/tasks', {
          method: 'POST',
          body: payload,
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.message || '创建任务失败');
        }

        toast.success('任务创建成功');
        resetForm();
        onOpenChange(false);
        onSuccess?.();
      } catch (error) {
        console.error('Create task failed:', error);
        toast.error(error instanceof Error ? error.message : '创建任务失败');
      }
    },
    [onOpenChange, onSuccess, resetForm, selectedFiles]
  );

  const onInvalid = useCallback((formErrors: FieldErrors<CreateTaskFormValues>) => {
    let message: string | null = null;
    for (const error of Object.values(formErrors)) {
      if (
        error &&
        typeof error === 'object' &&
        'message' in error &&
        typeof error.message === 'string'
      ) {
        message = error.message;
        break;
      }
    }
    toast.error(message || '表单校验失败');
  }, []);

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
              <TabsTrigger
                value="text_to_image"
                className="text-xs font-medium flex items-center gap-2"
              >
                <Type className="w-3.5 h-3.5" />
                文生图
              </TabsTrigger>
              <TabsTrigger
                value="image_to_image"
                className="text-xs font-medium flex items-center gap-2"
              >
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
        <div
          className={cn(
            'flex-1 flex flex-col gap-6 bg-background',
            isMobile ? 'p-4 pb-6' : 'p-8 overflow-y-auto'
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
                {isImageTask ? '图片描述 (可修改)' : '提示词'}
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
              placeholder={
                isImageTask
                  ? '上传图片后自动分析，也可手动编辑...'
                  : '请输入生成图片的描述，越详细越好...'
              }
              className={cn(
                'flex-1 min-h-[200px] resize-none text-base leading-relaxed shadow-sm transition-shadow focus:shadow-md p-4',
                isMobile && 'min-h-40'
              )}
              disabled={isAnalyzing}
            />
            {errors.userPrompt && (
              <p className="text-xs text-destructive">{errors.userPrompt.message}</p>
            )}
          </div>

          {/* Settings Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div className="space-y-2">
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

            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground/80">图片尺寸</Label>
              <Controller
                name="generationOptions.size"
                control={control}
                render={({ field }) => {
                  const getSizeLabel = (value: string | undefined) => {
                    const sizeLabels: Record<string, string> = {
                      '1K': '1K (智能尺寸)',
                      '2K': '2K (智能尺寸)',
                      '4K': '4K (智能尺寸)',
                      '2048x2048': '2048×2048 (1:1)',
                      '2560x1440': '2560×1440 (16:9)',
                      '1440x2560': '1440×2560 (9:16)',
                      '2304x1728': '2304×1728 (4:3)',
                      '1728x2304': '1728×2304 (3:4)',
                    };
                    return value ? sizeLabels[value] || value : '2K (智能尺寸)';
                  };

                  return (
                    <Select value={field.value || '2K'} onValueChange={field.onChange}>
                      <SelectTrigger className="h-11 w-full shadow-sm">
                        <SelectValue placeholder="选择图片尺寸">
                          {getSizeLabel(field.value)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1K">1K (智能尺寸)</SelectItem>
                        <SelectItem value="2K">2K (智能尺寸)</SelectItem>
                        <SelectItem value="4K">4K (智能尺寸)</SelectItem>
                        <SelectItem value="2048x2048">2048×2048 (1:1)</SelectItem>
                        <SelectItem value="2560x1440">2560×1440 (16:9)</SelectItem>
                        <SelectItem value="1440x2560">1440×2560 (9:16)</SelectItem>
                        <SelectItem value="2304x1728">2304×1728 (4:3)</SelectItem>
                        <SelectItem value="1728x2304">1728×2304 (3:4)</SelectItem>
                      </SelectContent>
                    </Select>
                  );
                }}
              />
            </div>
          </div>

          {/* Batch Size and Sequential Mode */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col">
              <Label className="text-sm font-medium text-foreground/80 mb-2">
                {isSequentialMode ? '批次数量' : '生成数量'}
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={imageNumber}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    const normalized = Number.isNaN(value) ? DEFAULT_IMAGE_NUMBER : value;
                    const clampedValue = Math.max(1, Math.min(500, normalized));
                    setValue('imageNumber', clampedValue, {
                      shouldValidate: true,
                      shouldDirty: true,
                    });
                  }}
                  onBlur={(e) => {
                    const value = parseInt(e.target.value, 10);
                    if (Number.isNaN(value) || value < 1) {
                      setValue('imageNumber', 1, { shouldValidate: true });
                      toast.error('数量不能小于1');
                    } else if (value > 500) {
                      setValue('imageNumber', 500, { shouldValidate: true });
                      toast.error('数量不能超过500');
                    }
                  }}
                  placeholder="1-500"
                  className="h-11 w-full shadow-sm pr-16 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none select-none">
                  <span className="text-sm text-muted-foreground">
                    {isSequentialMode ? '批' : '张'}
                  </span>
                  <span className="text-xs text-muted-foreground/40">/ 500</span>
                </div>
              </div>
              <div className="h-5 mt-2 flex items-start">
                {errors.imageNumber && (
                  <p className="text-xs text-destructive leading-5">{errors.imageNumber.message}</p>
                )}
              </div>
            </div>

            <div className="flex flex-col">
              <Label className="text-sm font-medium text-foreground/80 mb-2">组图模式</Label>
              <Controller
                name="generationOptions.sequentialImageGeneration"
                control={control}
                render={({ field }) => (
                  <Select value={field.value || 'disabled'} onValueChange={field.onChange}>
                    <SelectTrigger className="h-11 w-full shadow-sm">
                      <SelectValue placeholder="选择组图模式">
                        {field.value === 'auto' ? '开启 (AI智能生成组图)' : '关闭 (每批生成1张)'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="disabled">关闭 (每批生成1张)</SelectItem>
                      <SelectItem value="auto">开启 (AI智能生成组图)</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              <div className="h-5 mt-2 flex items-start">
                <p className="text-[10px] text-muted-foreground/60 leading-5">
                  {isSequentialMode ? '⚠️ 开启后每批可能生成多张关联图片' : '每批固定生成1张图片'}
                </p>
              </div>
            </div>
          </div>

          {/* Advanced Options */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground/80">提示词优化</Label>
            <Controller
              name="generationOptions.optimizePromptOptions.mode"
              control={control}
              render={({ field }) => (
                <Select value={field.value || 'standard'} onValueChange={field.onChange}>
                  <SelectTrigger className="h-11 w-full shadow-sm">
                    <SelectValue placeholder="选择优化模式">
                      {field.value === 'fast' ? '快速模式 (速度优先)' : '标准模式 (质量优先)'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">标准模式 (质量优先)</SelectItem>
                    <SelectItem value="fast">快速模式 (速度优先)</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-[10px] text-muted-foreground/60">
              标准模式生成质量更高但耗时稍长，快速模式生成速度更快
            </p>
          </div>

          {/* Sequential Mode Options */}
          {isSequentialMode && (
            <div className="p-4 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30 rounded-lg space-y-3">
              <div className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                    组图模式已开启
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                    AI
                    将根据提示词智能判断每批生成的图片数量。您可以设置每批最多生成的图片数量，未设置时默认最多15张。
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium text-amber-900 dark:text-amber-100">
                  每批最多生成 (可选)
                </Label>
                <Controller
                  name="generationOptions.sequentialImageGenerationOptions.maxImages"
                  control={control}
                  render={({ field }) => {
                    const currentValue = field.value?.toString() || 'auto';
                    return (
                      <Select
                        value={currentValue}
                        onValueChange={(v) =>
                          field.onChange(v === 'auto' ? undefined : parseInt(v))
                        }
                      >
                        <SelectTrigger className="h-9 bg-background">
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
                    );
                  }}
                />
              </div>
            </div>
          )}

          {/* Price Estimation */}
          <div
            className={cn(
              'px-4 py-3 rounded-lg border space-y-3',
              isSequentialMode
                ? 'bg-amber-50/30 dark:bg-amber-950/10 border-amber-200/50 dark:border-amber-800/30'
                : 'bg-primary/5 border-primary/10'
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="w-4 h-4" />
                <span
                  className={
                    isSequentialMode ? 'text-amber-900 dark:text-amber-100' : 'text-primary/80'
                  }
                >
                  {isSequentialMode ? '预付费用 (最大值)' : '预计消耗点数'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'text-xl font-bold',
                    isSequentialMode ? 'text-amber-700 dark:text-amber-300' : 'text-primary'
                  )}
                >
                  {formatCurrency(estimatedCost)}
                </span>
              </div>
            </div>

            <div className="text-xs space-y-1.5">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>单张价格</span>
                <span className="font-medium">{formatCurrency(perImagePrice)}</span>
              </div>

              {!isSequentialMode ? (
                // 传统模式：简单计算
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>生成数量</span>
                  <span className="font-medium">{imageNumber} 张</span>
                </div>
              ) : (
                // 组图模式：详细计算
                <>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>批次数量</span>
                    <span className="font-medium">{imageNumber} 批</span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>每批最多</span>
                    <span className="font-medium">
                      {generationOptions?.sequentialImageGenerationOptions?.maxImages || 15} 张
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-amber-200/50 dark:border-amber-800/30">
                    <span className="text-amber-700 dark:text-amber-300 font-medium">预期最多</span>
                    <span className="font-bold text-amber-700 dark:text-amber-300">
                      {expectedImageCount} 张
                    </span>
                  </div>
                </>
              )}

              <div className="flex items-center justify-between pt-1.5 border-t">
                <span
                  className={cn(
                    'font-medium',
                    isSequentialMode ? 'text-amber-800 dark:text-amber-200' : 'text-foreground'
                  )}
                >
                  计费公式
                </span>
                <span
                  className={cn(
                    'font-mono text-[10px]',
                    isSequentialMode
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-muted-foreground'
                  )}
                >
                  {!isSequentialMode
                    ? `${imageNumber} × ${formatCurrency(perImagePrice)}`
                    : `${imageNumber} × ${generationOptions?.sequentialImageGenerationOptions?.maxImages || 15} × ${formatCurrency(perImagePrice)}`}
                </span>
              </div>
            </div>

            {isSequentialMode && (
              <div className="pt-2 mt-1 border-t border-amber-200/50 dark:border-amber-800/30">
                <div className="flex items-start gap-2">
                  <span className="text-amber-600 dark:text-amber-400 text-xs">💡</span>
                  <p className="text-amber-700 dark:text-amber-300 text-[11px] leading-relaxed">
                    <strong>组图模式说明：</strong>预付费按<strong>每批最多生成数</strong>
                    计算。实际生成完成后， 系统会根据<strong>实际生成数量</strong>
                    自动退还多余点数到您的账户。
                  </p>
                </div>
                <div className="mt-2 p-2 bg-background/50 rounded text-[10px] text-amber-700 dark:text-amber-300">
                  <div className="flex justify-between">
                    <span>示例：预期最多 {expectedImageCount} 张</span>
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <span>实际生成：假设 {Math.floor(expectedImageCount * 0.6)} 张</span>
                  </div>
                  <div className="flex justify-between mt-0.5 font-medium">
                    <span>自动退款：</span>
                    <span>
                      {formatCurrency(
                        (expectedImageCount - Math.floor(expectedImageCount * 0.6)) * perImagePrice
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar: Reference Images */}
        <div
          className={cn(
            'border-l bg-muted/10 p-6 flex flex-col gap-4 shrink-0 transition-all duration-300 h-full',
            imageInputMode === 'single' ? 'overflow-hidden' : 'overflow-y-auto',
            isMobile ? 'w-full border-l-0 border-t p-4 h-auto' : 'w-[400px]'
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

            {/* Mode Toggle */}
            <div className="grid grid-cols-2 p-1 bg-muted/50 rounded-lg border">
              <button
                type="button"
                onClick={() => {
                  if (imageInputMode !== 'single') {
                    setImageInputMode('single');
                    // 如果切换到单图模式且有多张图，保留第一张
                    if (selectedFiles.length > 1) {
                      const firstFile = selectedFiles[0];
                      const firstUrl = previewUrls[0];
                      // 清理其他的
                      previewUrls.slice(1).forEach((url) => URL.revokeObjectURL(url));
                      setSelectedFiles([firstFile]);
                      setPreviewUrls([firstUrl]);
                      // 触发分析
                      if (isImageTask) analyzeImage(firstFile);
                    }
                  }
                }}
                className={cn(
                  'flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-all',
                  imageInputMode === 'single'
                    ? 'bg-background text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                单图模式
              </button>
              <button
                type="button"
                onClick={() => {
                  setImageInputMode('multi');
                  // 切换到多图模式，不需要特殊处理，保留当前图片即可
                }}
                className={cn(
                  'flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-all',
                  imageInputMode === 'multi'
                    ? 'bg-background text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Layers className="w-3.5 h-3.5" />
                多图模式
              </button>
            </div>
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
              accept="image/*"
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
                          e.stopPropagation();
                          removeImage(index);
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
                    toast.error('请先输入任务名称');
                    return;
                  }
                  fileInputRef.current?.click();
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
                          e.stopPropagation();
                          removeImage(0);
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
          'flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/5 shrink-0',
          isMobile && 'flex-col-reverse items-stretch gap-2 px-4 py-3'
        )}
      >
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
    </form>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="p-0 gap-0 overflow-hidden flex flex-col shadow-2xl bg-background h-[95vh] max-h-[95vh] rounded-t-3xl">
          {modalBody}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1000px] p-0 gap-0 overflow-hidden flex flex-col shadow-2xl h-[85vh]">
        {modalBody}
      </DialogContent>
    </Dialog>
  );
}
