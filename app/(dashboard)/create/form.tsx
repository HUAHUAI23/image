'use client'

import { useActionState } from 'react'
import { createTaskAction } from '@/app/actions/task'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Template = {
  id: number
  name: string
  content: string
}

export default function CreateTaskForm({ templates }: { templates: Template[] }) {
  const [state, action, isPending] = useActionState(createTaskAction, null)
  const router = useRouter()
  const [type, setType] = useState('text_to_image')

  useEffect(() => {
    if (state && 'success' in state && state.success) {
      toast.success('任务创建成功')
      router.push('/')
    } else if (state?.message) {
      toast.error(state.message)
    }
  }, [state, router])

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>创建新任务</CardTitle>
          <CardDescription>选择任务类型并输入提示词生成图片</CardDescription>
        </CardHeader>
        <form action={action}>
          <CardContent className="grid gap-6">
            <div className="grid gap-2">
              <Label htmlFor="type">任务类型</Label>
              <Select name="type" defaultValue="text_to_image" onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue placeholder="选择类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text_to_image">文生图</SelectItem>
                  <SelectItem value="image_to_image">图生图</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="templateId">提示词模板 (可选)</Label>
              <Select name="templateId">
                <SelectTrigger>
                  <SelectValue placeholder="选择模板" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不使用模板</SelectItem>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="userPrompt">补充提示词</Label>
              <Textarea
                id="userPrompt"
                name="userPrompt"
                placeholder="输入您的描述..."
                rows={4}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="image">原始图片 {type === 'image_to_image' && <span className="text-red-500">*</span>}</Label>
              <Input id="image" name="image" type="file" accept="image/*" required={type === 'image_to_image'} />
              <p className="text-xs text-muted-foreground">
                {type === 'image_to_image' ? '图生图必须上传底图' : '上传图片用于 VLM 分析辅助生成提示词'}
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? '创建中...' : '开始生成'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}