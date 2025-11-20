import { getTasksAction } from '@/app/actions/task'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CreateTaskButton } from '@/components/create-task-button'
import Image from 'next/image'
import { ImageIcon, Clock, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react'
import { SidebarTrigger } from "@/components/ui/sidebar"

export default async function TaskListPage() {
  const tasks = await getTasksAction()

  if (tasks.length === 0) {
    return (
      <div className="relative flex-1 flex flex-col items-center justify-center p-6 md:p-12 overflow-hidden h-full w-full">
        {/* Mobile Sidebar Trigger - Absolute Positioned */}
        <div className="absolute top-4 left-4 md:hidden z-50">
            <SidebarTrigger />
        </div>

        {/* Abstract Background Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-3xl" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,var(--tw-gradient-stops))] from-background via-background/80 to-background/40" />
        </div>

        {/* Main Content Container */}
        <div className="relative z-10 w-full max-w-4xl mx-auto flex flex-col items-center text-center space-y-16">

            {/* Hero Section */}
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="space-y-4 max-w-2xl mx-auto">
                    <h2 className="text-4xl md:text-6xl font-bold tracking-tight bg-clip-text text-transparent bg-linear-to-b from-foreground via-foreground/90 to-muted-foreground">
                        释放无限创意
                    </h2>
                    <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-xl mx-auto">
                        输入灵感，即刻生成。探索 AI 带来的视觉奇迹，让想象力触手可及。
                    </p>
                </div>

                <div className="pt-4">
                    <CreateTaskButton className="h-14 px-10 text-lg rounded-full shadow-2xl shadow-primary/20 hover:shadow-primary/40 transition-all hover:-translate-y-1 active:scale-95 font-medium bg-linear-to-r from-primary to-purple-600 border-0" >
                        开始创作
                    </CreateTaskButton>
                </div>
            </div>

            {/* Inspiration/Features Grid - Floating Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
                 <div className="group relative overflow-hidden rounded-2xl aspect-4/3 md:aspect-video cursor-pointer border border-white/10 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                    <div className="absolute inset-0 bg-linear-to-br from-pink-500/80 via-purple-500/80 to-indigo-500/80 transition-transform duration-500 group-hover:scale-110" />
                    <div className="absolute inset-0 p-6 flex flex-col justify-end text-white">
                        <h4 className="font-bold text-lg">赛博朋克</h4>
                        <p className="text-white/80 text-sm">霓虹闪烁的未来都市</p>
                    </div>
                 </div>

                 <div className="group relative overflow-hidden rounded-2xl aspect-4/3 md:aspect-video cursor-pointer border border-white/10 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 md:-mt-8">
                    <div className="absolute inset-0 bg-linear-to-br from-emerald-400/80 via-teal-500/80 to-cyan-600/80 transition-transform duration-500 group-hover:scale-110" />
                    <div className="absolute inset-0 p-6 flex flex-col justify-end text-white">
                         <h4 className="font-bold text-lg">自然奇观</h4>
                         <p className="text-white/80 text-sm">壮丽的山川与湖泊</p>
                    </div>
                 </div>

                 <div className="group relative overflow-hidden rounded-2xl aspect-4/3 md:aspect-video cursor-pointer border border-white/10 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                    <div className="absolute inset-0 bg-linear-to-br from-orange-400/80 via-amber-500/80 to-yellow-500/80 transition-transform duration-500 group-hover:scale-110" />
                    <div className="absolute inset-0 p-6 flex flex-col justify-end text-white">
                        <h4 className="font-bold text-lg">3D 艺术</h4>
                        <p className="text-white/80 text-sm">极简主义渲染风格</p>
                    </div>
                 </div>
            </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 h-full w-full">
      <div className="max-w-7xl mx-auto w-full flex flex-col gap-6 h-full">
          <div className="flex items-center gap-2 mb-2 md:hidden">
            <SidebarTrigger />
          </div>

          <div className="flex items-center justify-between shrink-0">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">任务列表</h1>
              <p className="text-muted-foreground">
                管理您的图片生成任务
              </p>
            </div>
            <CreateTaskButton />
          </div>

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
                      <p className="text-sm font-medium line-clamp-2 min-h-10" title={task.userPrompt || '无提示词'}>
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
      </div>
    </div>
  )
}
