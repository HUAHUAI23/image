import { getTasksAction } from '@/app/actions/task'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CreateTaskButton } from '@/components/create-task-button'
import Image from 'next/image'
import { ImageIcon, Clock, AlertCircle, CheckCircle2 } from 'lucide-react'

export default async function TaskListPage() {
  const tasks = await getTasksAction()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">任务列表</h1>
          <p className="text-muted-foreground">
            管理您的图片生成任务
          </p>
        </div>
        <CreateTaskButton />
      </div>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center animate-in fade-in-50">
            <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                    <ImageIcon className="h-10 w-10 text-muted-foreground" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">暂无任务</h3>
                <p className="mb-4 mt-2 text-sm text-muted-foreground">
                    您还没有创建任何图片生成任务。点击下方按钮开始。
                </p>
                <CreateTaskButton />
            </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tasks.map((task) => (
            <Card key={task.id} className="group overflow-hidden transition-all hover:shadow-md">
              <div className="aspect-square relative bg-muted overflow-hidden">
                {task.generatedImageUrl ? (
                    <Image
                        src={task.generatedImageUrl}
                        alt="Generated"
                        fill
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                ) : task.originalImageUrl ? (
                    <>
                        <Image
                            src={task.originalImageUrl}
                            alt="Original"
                            fill
                            className="object-cover opacity-50 blur-sm"
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Badge variant="secondary" className="backdrop-blur-md">
                                {task.status === 'pending' && '等待处理'}
                                {task.status === 'processing' && '生成中...'}
                            </Badge>
                        </div>
                    </>
                ) : (
                    <div className="flex h-full items-center justify-center">
                        <ImageIcon className="h-12 w-12 text-muted-foreground/20" />
                    </div>
                )}

                <div className="absolute top-2 right-2">
                    <Badge variant={
                        task.status === 'success' ? 'default' :
                        task.status === 'failed' ? 'destructive' : 'secondary'
                    } className="shadow-sm">
                        {task.status === 'success' && <CheckCircle2 className="mr-1 h-3 w-3" />}
                        {task.status === 'failed' && <AlertCircle className="mr-1 h-3 w-3" />}
                        {task.status === 'pending' && <Clock className="mr-1 h-3 w-3 animate-pulse" />}
                        {task.status === 'processing' && <Clock className="mr-1 h-3 w-3 animate-spin" />}
                        <span className="capitalize">{task.status}</span>
                    </Badge>
                </div>
              </div>

              <CardContent className="p-4">
                <div className="space-y-1">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            {task.type === 'text_to_image' ? '文生图' : '图生图'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                            #{task.id}
                        </span>
                    </div>
                    <p className="text-sm font-medium line-clamp-2 min-h-[2.5rem]" title={task.userPrompt || '无提示词'}>
                        {task.userPrompt || '无提示词'}
                    </p>
                </div>
              </CardContent>
              <CardFooter className="p-4 pt-0 text-xs text-muted-foreground">
                {new Date(task.createdAt).toLocaleString()}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
