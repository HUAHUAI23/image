'use client'

import { useActionState } from 'react'
import { createTaskAction } from '@/app/actions/task'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { useEffect, useState, useRef } from 'react'
import { Sparkles, Loader2, Wand2, UploadCloud, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getPromptTemplatesAction } from '@/app/actions/template'

type Template = {
  id: number
  name: string
  content: string
}

interface CreateTaskModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateTaskModal({ open, onOpenChange }: CreateTaskModalProps) {
  const [state, action, isPending] = useActionState(createTaskAction, null)
  const [type, setType] = useState('text_to_image')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string>('none')

  useEffect(() => {
    if (open) {
      getPromptTemplatesAction().then(setTemplates)
    }
  }, [open])

  useEffect(() => {
    if (state && 'success' in state && state.success) {
      toast.success('任务创建成功')
      onOpenChange(false)
      // Reset form state
      setType('text_to_image')
      setPreviewUrl(null)
      setSelectedTemplate('none')
    } else if (state?.message) {
      toast.error(state.message)
    }
  }, [state, onOpenChange])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      const url = URL.createObjectURL(selectedFile)
      setPreviewUrl(url)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && droppedFile.type.startsWith('image/')) {
        const url = URL.createObjectURL(droppedFile)
        setPreviewUrl(url)
        const dataTransfer = new DataTransfer()
        dataTransfer.items.add(droppedFile)
        if (fileInputRef.current) {
            fileInputRef.current.files = dataTransfer.files
        }
    }
  }

  const clearFile = (e: React.MouseEvent) => {
      e.stopPropagation()
      setPreviewUrl(null)
      if (fileInputRef.current) {
          fileInputRef.current.value = ''
      }
  }

  // Apply template to prompt
  // Note: This requires access to the form or state.
  // Since we use native form action, we might need to control the textarea value if we want to support template insertion.
  // But the original code didn't seem to pre-fill, just select a template ID.
  // I will assume the backend handles the template ID + prompt combination,
  // OR the client should fill it. The original code just sent templateId.

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] p-0 gap-0 overflow-hidden flex flex-col border-none shadow-2xl bg-background/95 backdrop-blur-sm">
        <form action={action} className="flex flex-col h-full">
            {/* Header Area */}
            <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/20">
                <div className="flex items-center gap-2">
                    <DialogTitle className="text-lg font-medium">Create New Task</DialogTitle>
                </div>
                <div className="flex items-center gap-2">
                   <Tabs value={type} onValueChange={setType} className="w-[240px]">
                        <TabsList className="grid w-full grid-cols-2 h-9">
                            <TabsTrigger value="text_to_image" className="text-xs">文生图</TabsTrigger>
                            <TabsTrigger value="image_to_image" className="text-xs">图生图</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>
            </div>

            <div className="flex flex-1 h-[500px] overflow-hidden">
                {/* Main Content: Prompt & Settings */}
                <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto">

                    <div className="space-y-4 flex-1 flex flex-col">
                        <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                                <Sparkles className="w-4 h-4 text-primary" />
                                提示词 (Prompt)
                            </Label>
                            {/* Hidden input for type since we use Tabs state but need to submit it */}
                            <input type="hidden" name="type" value={type} />
                        </div>

                        <div className="relative flex-1">
                            <Textarea
                                name="userPrompt"
                                placeholder="描述您想象中的画面... (例如: 赛博朋克风格的街道, 霓虹灯, 雨夜)"
                                className="w-full h-full min-h-[200px] resize-none border-muted bg-muted/10 focus:bg-background p-4 text-base leading-relaxed rounded-xl transition-all focus:ring-1 focus:ring-primary/20"
                            />
                            <div className="absolute bottom-3 right-3 flex gap-2">
                                <div className="text-xs text-muted-foreground bg-background/50 px-2 py-1 rounded-md backdrop-blur-sm border">
                                    Enter to confirm
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">风格模板</Label>
                            <Select name="templateId" value={selectedTemplate} onValueChange={setSelectedTemplate}>
                                <SelectTrigger className="h-10 bg-muted/10 border-muted hover:bg-muted/20 transition-colors">
                                    <SelectValue placeholder="选择风格..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">自由创作 (无模板)</SelectItem>
                                    {templates.map(t => (
                                        <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Add more settings here if needed, e.g., Aspect Ratio */}
                        <div className="space-y-2">
                             <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">尺寸比例</Label>
                             <Select defaultValue="1:1" name="ratio">
                                <SelectTrigger className="h-10 bg-muted/10 border-muted hover:bg-muted/20 transition-colors">
                                    <SelectValue placeholder="1:1" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1:1">1:1 (正方形)</SelectItem>
                                    <SelectItem value="16:9">16:9 (宽屏)</SelectItem>
                                    <SelectItem value="9:16">9:16 (竖屏)</SelectItem>
                                    <SelectItem value="4:3">4:3 (标准)</SelectItem>
                                    <SelectItem value="3:4">3:4 (纵向)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                {/* Right Sidebar: Image Reference */}
                <div className="w-[320px] border-l bg-muted/5 p-6 flex flex-col gap-4">
                     <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium text-muted-foreground">参考图片</Label>
                        {type === 'image_to_image' && <span className="text-[10px] px-1.5 py-0.5 bg-destructive/10 text-destructive rounded font-medium">必填</span>}
                    </div>

                    <div
                        className={cn(
                            "flex-1 border-2 border-dashed rounded-xl relative group transition-all overflow-hidden",
                            previewUrl ? "border-primary/20 bg-muted/20" : "border-muted hover:border-primary/50 hover:bg-muted/10",
                            type === 'image_to_image' && !previewUrl && "border-destructive/30 bg-destructive/5"
                        )}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
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
                                    <img src={previewUrl} alt="Preview" className="max-w-full max-h-full object-contain p-2" />
                                </div>
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <p className="text-white text-xs font-medium">点击替换图片</p>
                                </div>
                                <Button
                                    type="button"
                                    variant="destructive"
                                    size="icon"
                                    className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={clearFile}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </>
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground p-4 text-center">
                                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                                    <UploadCloud className="h-5 w-5" />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm font-medium text-foreground">点击或拖拽上传</p>
                                    <p className="text-xs">支持 JPG, PNG</p>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="mt-auto pt-4 border-t border-border/50">
                        <Button type="submit" disabled={isPending} className="w-full h-11 text-base shadow-lg hover:shadow-primary/20 transition-all">
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
                </div>
            </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
