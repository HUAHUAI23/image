'use client';

import { useActionState } from 'react';
import { useEffect, useRef, useState } from 'react';
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

import { createTaskAction, getPricesAction } from '@/app/actions/task';
import { getPromptTemplatesAction } from '@/app/actions/template';
import { formatCurrency } from '@/lib/const';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
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
import { cn } from '@/lib/utils';

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
  const [state, action, isPending] = useActionState(createTaskAction, null);
  const [type, setType] = useState('image_to_image');
  const [taskName, setTaskName] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [imageNumber, setImageNumber] = useState(4);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('none');
  const [prices, setPrices] = useState<any[]>([]);
  const [estimatedCost, setEstimatedCost] = useState(0);

  // Load templates and prices when modal opens
  useEffect(() => {
    if (open) {
      getPromptTemplatesAction().then(setTemplates);
      getPricesAction().then(setPrices);
    }
  }, [open]);

  // Calculate estimated cost
  useEffect(() => {
    const priceRecord = prices.find((p) => p.taskType === type && p.priceUnit === 'per_image');
    if (priceRecord) {
      setEstimatedCost(priceRecord.price * imageNumber);
    } else {
      setEstimatedCost(0);
    }
  }, [prices, type, imageNumber]);

  // Handle action result
  useEffect(() => {
    if (state && 'success' in state && state.success) {
      toast.success('任务创建成功');
      onOpenChange(false);
      // Reset form state
      setType('image_to_image');
      setTaskName('');
      setUserPrompt('');
      setImageNumber(4);
      setPreviewUrl(null);
      setUploadedImageUrl(null);
      setSelectedTemplate('none');
      // Trigger refresh
      onSuccess?.();
    } else if (state?.message) {
      toast.error(state.message);
    }
  }, [state, onOpenChange, onSuccess]);

  // Handle file upload and trigger VLM analysis
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Create preview URL
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);

    // Upload to TOS and analyze with VLM
    if (type === 'image_to_image') {
      await analyzeImage(selectedFile);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type.startsWith('image/')) {
      const url = URL.createObjectURL(droppedFile);
      setPreviewUrl(url);
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(droppedFile);
      if (fileInputRef.current) {
        fileInputRef.current.files = dataTransfer.files;
      }

      // Analyze with VLM
      if (type === 'image_to_image') {
        await analyzeImage(droppedFile);
      }
    }
  };

  const analyzeImage = async (file: File) => {
    if (!taskName || taskName.trim().length === 0) {
      toast.error('请先输入任务名称');
      return;
    }

    setIsAnalyzing(true);
    try {
      // Upload to TOS and analyze with VLM
      const formData = new FormData();
      formData.append('image', file);
      formData.append('taskName', taskName);

      toast.info('正在上传图片并分析...');

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        setUploadedImageUrl(result.imageUrl);
        setUserPrompt(result.analysis);
        toast.success('图片分析完成！');
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error) {
      console.error('VLM analysis failed:', error);
      toast.error('图片分析失败：' + (error instanceof Error ? error.message : '未知错误'));
      setUserPrompt('图片分析失败，请手动输入描述...');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const clearFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewUrl(null);
    setUploadedImageUrl(null);
    setUserPrompt('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1000px] p-0 gap-0 overflow-hidden flex flex-col shadow-2xl h-[85vh]">
        <form action={action} className="flex flex-col h-full">
          {/* Header Area */}
          <div className="flex items-center justify-between px-6 py-4 border-b shrink-0 relative bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
            <DialogTitle className="text-lg font-medium">创建新任务</DialogTitle>

            {/* Centered Tabs */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <Tabs value={type} onValueChange={setType} className="w-[280px]">
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
            <div className="w-8" />
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Main Content: Inputs */}
            <div className="flex-1 p-8 flex flex-col gap-6 overflow-y-auto bg-background">
              {/* Task Name */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  任务名称
                  <span className="text-xs text-destructive">*</span>
                </Label>
                <Input
                  name="name"
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  placeholder="例如: 产品宣传图-金融风格"
                  required
                  className="h-11 text-base shadow-sm transition-shadow focus:shadow-md"
                />
              </div>

              {/* User Prompt */}
              <div className="space-y-2 flex-1 flex flex-col">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    {type === 'image_to_image' ? '图片描述 (可修改)' : '提示词'}
                    {type === 'text_to_image' && (
                      <span className="text-xs text-destructive">*</span>
                    )}
                  </Label>
                  {isAnalyzing && (
                    <span className="text-xs text-muted-foreground animate-pulse flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> 分析中...
                    </span>
                  )}
                </div>
                <Textarea
                  name="userPrompt"
                  value={userPrompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                  placeholder={
                    type === 'image_to_image'
                      ? '上传图片后自动分析，也可手动编辑...'
                      : '请输入生成图片的描述，越详细越好...'
                  }
                  className="flex-1 min-h-[200px] resize-none text-base leading-relaxed shadow-sm transition-shadow focus:shadow-md p-4"
                  disabled={isAnalyzing}
                  required={type === 'text_to_image'}
                />
              </div>

              {/* Settings Grid */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">风格模板</Label>
                  <Select
                    name="templateId"
                    value={selectedTemplate}
                    onValueChange={setSelectedTemplate}
                  >
                    <SelectTrigger className="h-11 shadow-sm w-full">
                      <SelectValue placeholder="选择模板..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">无模板</SelectItem>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id.toString()}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">生成数量</Label>
                  <div className="relative">
                    <Input
                      name="imageNumber"
                      type="number"
                      min={1}
                      max={200}
                      value={imageNumber}
                      onChange={(e) => {
                        const value = parseInt(e.target.value) || 4;
                        const clampedValue = Math.max(1, Math.min(200, value));
                        setImageNumber(clampedValue);
                      }}
                      onBlur={(e) => {
                        const value = parseInt(e.target.value) || 4;
                        if (value < 1) {
                          setImageNumber(1);
                          toast.error('图片数量不能小于1');
                        } else if (value > 200) {
                          setImageNumber(200);
                          toast.error('图片数量不能超过200');
                        }
                      }}
                      placeholder="1-200"
                      className="h-11 shadow-sm pr-12 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                      / 200
                    </span>
                  </div>
                </div>
              </div>

              {/* Price Estimation */}
              <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>预计消耗:</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-primary">
                    {formatCurrency(estimatedCost)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({formatCurrency(
                      prices.find((p) => p.taskType === type && p.priceUnit === 'per_image')
                        ?.price || 0
                    )}{' '}
                    / 张)
                  </span>
                </div>
              </div>

              {/* Hidden inputs */}
              <input type="hidden" name="type" value={type} />
              {uploadedImageUrl && (
                <input type="hidden" name="existingImageUrl" value={uploadedImageUrl} />
              )}
            </div>

            {/* Right Sidebar: Reference Image */}
            <div className="w-[360px] border-l bg-muted/10 p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-foreground/80">
                  {type === 'image_to_image' ? '参考图片' : '参考图片 (可选)'}
                </Label>
                {type === 'image_to_image' && (
                  <span className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary rounded-full font-medium">
                    必填
                  </span>
                )}
              </div>

              <div
                className={cn(
                  'flex-1 border-2 border-dashed rounded-xl relative group transition-all overflow-hidden duration-200',
                  previewUrl
                    ? 'border-primary/20 bg-background'
                    : 'border-muted-foreground/20 hover:border-primary/50 hover:bg-muted/20',
                  type === 'image_to_image' &&
                    !previewUrl &&
                    'border-destructive/20 bg-destructive/5',
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
                  required={type === 'image_to_image'}
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
                        type === 'image_to_image'
                          ? 'bg-primary/5 text-primary'
                          : 'bg-muted text-muted-foreground'
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
                          <p className="text-xs text-muted-foreground/60">
                            支持 JPG, PNG (最大 10MB)
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Helper Text */}
              <div className="text-[10px] text-muted-foreground/50 px-1">
                {type === 'image_to_image'
                  ? '上传的图片将作为生成新图片的基础参考。系统会自动分析图片内容。'
                  : '可选择上传图片作为风格或构图参考，留空则纯文本生成。'}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/5 shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-10 px-6"
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={isPending || isAnalyzing}
              className="h-10 px-8 min-w-[140px] shadow-lg shadow-primary/20 transition-all hover:shadow-primary/30"
            >
              {isPending ? (
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
      </DialogContent>
    </Dialog>
  );
}
