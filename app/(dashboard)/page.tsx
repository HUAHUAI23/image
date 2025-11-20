import { getTasksAction } from '@/app/actions/task'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Image from 'next/image'

export default async function TaskListPage() {
  const tasks = await getTasksAction()

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold">任务列表</h1>
      {tasks.length === 0 ? (
        <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
                暂无任务，请点击左侧“创建任务”开始。
            </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tasks.map((task) => (
            <Card key={task.id}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                    <CardTitle className="text-base">任务 #{task.id}</CardTitle>
                    <Badge variant={
                        task.status === 'success' ? 'default' :
                        task.status === 'failed' ? 'destructive' : 'secondary'
                    }>
                        {task.status === 'pending' && '等待中'}
                        {task.status === 'processing' && '进行中'}
                        {task.status === 'success' && '成功'}
                        {task.status === 'failed' && '失败'}
                    </Badge>
                </div>
                <CardDescription className="text-xs">
                    {new Date(task.createdAt).toLocaleString()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                    <div className="text-sm truncate">
                        <span className="font-medium">类型:</span> {task.type === 'text_to_image' ? '文生图' : '图生图'}
                    </div>
                    {task.generatedImageUrl ? (
                        <div className="aspect-square relative rounded-md overflow-hidden border">
                            <Image src={task.generatedImageUrl} alt="Generated" fill className="object-cover" />
                        </div>
                    ) : task.originalImageUrl ? (
                        <div className="aspect-square relative rounded-md overflow-hidden border opacity-50">
                            <Image src={task.originalImageUrl} alt="Original" fill className="object-cover" />
                             <div className="absolute inset-0 flex items-center justify-center text-xs font-medium bg-black/50 text-white">
                                原始图片
                             </div>
                        </div>
                    ) : (
                        <div className="aspect-square rounded-md border flex items-center justify-center bg-muted">
                            <span className="text-xs text-muted-foreground">等待生成...</span>
                        </div>
                    )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}