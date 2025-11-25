'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Controller, FieldErrors, Resolver, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Image as ImageIcon,
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
      existingImageUrl: '',
      hasLocalImage: false,
    },
  });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [prices, setPrices] = useState<any[]>([]);
  const isMobile = useIsMobile();
  const TitleComponent = isMobile ? DrawerTitle : DialogTitle;
  const isModalActiveRef = useRef(open);
  const analysisRunIdRef = useRef(0);
  const normalizedType = watch('type') || DEFAULT_TASK_TYPE;
  const taskName = watch('name');
  const imageNumber = watch('imageNumber');
  const isImageTask = normalizedType === 'image_to_image';
  const isTextTask = normalizedType === 'text_to_image';
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
    setPreviewUrl((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev);
      }
      return null;
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
      existingImageUrl: '',
      hasLocalImage: false,
    });
    cleanupPreview();
    setSelectedFile(null);
    setIsAnalyzing(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [cleanupPreview, reset]);

  // Analyze image with VLM (defined early for use in other callbacks)
  const analyzeImage = useCallback(
    async (file: File) => {
      if (!taskName || taskName.trim().length === 0) {
        toast.error('请先输入任务名称');
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

        setValue('existingImageUrl', result.imageUrl, { shouldValidate: true });
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
    [isTextTask, setValue, taskName]
  );

  // Handle file upload and trigger VLM analysis
  const processImageFile = useCallback(
    async (file: File) => {
      cleanupPreview();
      setSelectedFile(file);
      setValue('existingImageUrl', '', { shouldValidate: true });
      setValue('hasLocalImage', true, { shouldValidate: true });
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);

      if (isImageTask) {
        await analyzeImage(file);
      }
    },
    [analyzeImage, cleanupPreview, isImageTask, setValue]
  );

  // Handle file upload and trigger VLM analysis
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (!selectedFile) return;

      if (!taskName.trim()) {
        toast.error('请先输入任务名称');
        return;
      }

      await processImageFile(selectedFile);
    },
    [processImageFile, taskName]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files[0];
      if (!droppedFile || !droppedFile.type.startsWith('image/')) {
        return;
      }

      if (!taskName.trim()) {
        toast.error('请先输入任务名称');
        return;
      }

      await processImageFile(droppedFile);

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(droppedFile);
      if (fileInputRef.current) {
        fileInputRef.current.files = dataTransfer.files;
      }
    },
    [processImageFile, taskName]
  );

  const clearFile = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      cleanupPreview();
      setSelectedFile(null);
      setValue('existingImageUrl', '', { shouldValidate: true });
      setValue('hasLocalImage', false, { shouldValidate: true });
      setValue('userPrompt', '', { shouldDirty: true });

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [cleanupPreview, setValue]
  );

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

  const estimatedCost = useMemo(() => {
    return perImagePrice * imageNumber;
  }, [perImagePrice, imageNumber]);

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
        if (values.existingImageUrl) {
          payload.append('existingImageUrl', values.existingImageUrl);
        }
        if (selectedFile) {
          payload.append('image', selectedFile);
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
    [onOpenChange, onSuccess, resetForm, selectedFile]
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
                isMobile && 'min-h-[160px]'
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
                    <SelectTrigger className="h-11! w-full shadow-sm">
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
              <Label className="text-sm font-medium text-foreground/80">生成数量</Label>
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
                      toast.error('图片数量不能小于1');
                    } else if (value > 500) {
                      setValue('imageNumber', 500, { shouldValidate: true });
                      toast.error('图片数量不能超过500');
                    }
                  }}
                  placeholder="1-500"
                  className="h-11 w-full shadow-sm pr-12 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none select-none">
                  <span className="text-sm text-muted-foreground">张</span>
                  <span className="text-xs text-muted-foreground/40">/ 500</span>
                </div>
              </div>
              {errors.imageNumber && (
                <p className="text-xs text-destructive">{errors.imageNumber.message}</p>
              )}
            </div>
          </div>

          {/* Price Estimation */}
          <div
            className={cn(
              'flex items-center justify-between px-4 py-3 bg-primary/5 rounded-lg border border-primary/10',
              isMobile && 'flex-col items-start gap-2'
            )}
          >
            <div className="flex items-center gap-2 text-sm text-primary/80 font-medium">
              <Sparkles className="w-4 h-4" />
              <span>预计消耗点数</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-primary">
                {formatCurrency(estimatedCost)}
              </span>
              <span className="text-xs text-muted-foreground">
                ({formatCurrency(perImagePrice)} / 张)
              </span>
            </div>
          </div>
        </div>

        {/* Right Sidebar: Reference Image */}
        <div
          className={cn(
            'border-l bg-muted/10 p-6 flex flex-col gap-4 shrink-0',
            isMobile ? 'w-full border-l-0 border-t p-4' : 'w-[360px]'
          )}
        >
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium text-foreground/80">
              {isImageTask ? '参考图片' : '参考图片 (可选)'}
            </Label>
            {isImageTask && (
              <span className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary rounded-full font-medium">
                必填
              </span>
            )}
          </div>

          <div
            className={cn(
              'border-2 border-dashed rounded-xl relative group transition-all overflow-hidden duration-200',
              isMobile ? 'h-[240px]' : 'flex-1',
              previewUrl
                ? 'border-primary/20 bg-background'
                : 'border-muted-foreground/20 hover:border-primary/50 hover:bg-muted/20',
              isImageTask && !previewUrl && 'border-destructive/20 bg-destructive/5',
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
            <Input
              ref={fileInputRef}
              name="image"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />

            {previewUrl ? (
              <>
                <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="max-w-full max-h-full object-contain p-4"
                  />
                </div>
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                  <p className="text-white text-sm font-medium flex items-center gap-2">
                    <UploadCloud className="w-4 h-4" /> 点击替换图片
                  </p>
                </div>
                {isAnalyzing && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="text-white/90 text-sm font-medium">智能分析中...</p>
                    </div>
                  </div>
                )}
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute top-3 right-3 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow-lg"
                  onClick={clearFile}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-muted-foreground p-6 text-center">
                <div
                  className={cn(
                    'w-16 h-16 rounded-2xl flex items-center justify-center transition-colors',
                    isImageTask ? 'bg-primary/5 text-primary' : 'bg-muted text-muted-foreground'
                  )}
                >
                  <UploadCloud className="h-8 w-8" />
                </div>
                <div className="space-y-1.5">
                  {!taskName.trim() ? (
                    <>
                      <p className="text-sm font-medium">请先输入任务名称</p>
                      <p className="text-xs text-muted-foreground/60">输入后即可启用上传</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-foreground">点击或拖拽上传</p>
                      <p className="text-xs text-muted-foreground/60">支持 JPG, PNG (最大 500MB)</p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Helper Text */}
          {errors.existingImageUrl && (
            <p className="text-xs text-destructive px-1">{errors.existingImageUrl.message}</p>
          )}
          <div className="text-[10px] text-muted-foreground/50 px-1">
            {isImageTask
              ? '上传的图片将作为生成新图片的基础参考。系统会自动分析图片内容。'
              : '可选择上传图片作为风格或构图参考，留空则纯文本生成。'}
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
