'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, ImageIcon } from 'lucide-react';
import Image from 'next/image';

import { getTasksAction } from '@/app/actions/task';
import { CreateTaskButton } from '@/components/create-task-button';
import { ImageGalleryModal } from '@/components/modals/image-gallery-modal';
import { useModal } from '@/components/providers/modal-provider';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { SidebarTrigger } from '@/components/ui/sidebar';

// Constants
const POLLING_INTERVAL = 5000; // 5 seconds
const IMAGE_SIZES = {
  MOBILE: '100vw',
  TABLET: '50vw',
  DESKTOP_MD: '33vw',
  DESKTOP_LG: '25vw',
} as const;

type Task = {
  id: number;
  name: string;
  type: string;
  status: string;
  userPrompt: string | null;
  originalImageUrls: string[];
  generatedImageUrls: string[];
  createdAt: Date;
};

export default function TaskListPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const { setOnTaskSuccess } = useModal();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);

  // Handle opening gallery
  const handleOpenGallery = useCallback((task: Task) => {
    if (task.generatedImageUrls && task.generatedImageUrls.length > 0) {
      setSelectedTask(task);
      setIsGalleryOpen(true);
    }
  }, []);

  const getTextToImageOverlayCopy = useCallback((status: Task['status']) => {
    switch (status) {
      case 'pending':
        return {
          label: '等待处理',
          description: 'AI 正在准备生成您的作品',
        };
      case 'processing':
        return {
          label: '生成中...',
          description: 'AI 正在根据提示词创作',
        };
      case 'failed':
        return {
          label: '生成失败',
          description: '请调整提示词后重试',
        };
      default:
        return null;
    }
  }, []);

  // Initial load and polling setup
  useEffect(() => {
    let isMounted = true;

    const fetchTasks = async () => {
      const result = await getTasksAction();
      if (isMounted) {
        setTasks(result);
      }
    };

    // Initial load
    fetchTasks();

    // Setup polling for task status updates
    const interval = setInterval(fetchTasks, POLLING_INTERVAL);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Setup refresh callback on task success
  useEffect(() => {
    const refreshTasks = async () => {
      const result = await getTasksAction();
      setTasks(result);
    };

    setOnTaskSuccess(() => refreshTasks);
    return () => setOnTaskSuccess(undefined);
  }, [setOnTaskSuccess]);

  if (tasks.length === 0) {
    return (
      <div className="relative flex-1 flex flex-col items-center justify-center p-4 sm:p-6 md:p-12 overflow-hidden h-full w-full">
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
        <div className="relative z-10 w-full max-w-4xl mx-auto flex flex-col items-center text-center space-y-12 md:space-y-16 px-4 sm:px-0">
          {/* Hero Section */}
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full">
            <div className="space-y-4 max-w-2xl mx-auto">
              <h2 className="text-3xl sm:text-4xl md:text-6xl font-bold tracking-tight bg-clip-text text-transparent bg-linear-to-b from-foreground via-foreground/90 to-muted-foreground">
                释放无限创意
              </h2>
              <p className="text-base sm:text-lg md:text-xl text-muted-foreground leading-relaxed max-w-xl mx-auto">
                输入灵感，即刻生成。探索 AI 带来的视觉奇迹，让想象力触手可及。
              </p>
            </div>

            <div className="pt-4">
              <CreateTaskButton className="w-full sm:w-auto h-12 sm:h-14 px-6 sm:px-10 text-base sm:text-lg rounded-full shadow-2xl shadow-primary/20 hover:shadow-primary/40 transition-all hover:-translate-y-1 active:scale-95 font-medium bg-linear-to-r from-primary to-purple-600 border-0">
                开始创作
              </CreateTaskButton>
            </div>
          </div>

          {/* Inspiration/Features Grid - Floating Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6 w-full animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
            <div className="group relative overflow-hidden rounded-2xl aspect-5/3 sm:aspect-4/3 md:aspect-video cursor-pointer border border-white/10 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
              <div className="absolute inset-0 bg-linear-to-br from-pink-500/80 via-purple-500/80 to-indigo-500/80 transition-transform duration-500 group-hover:scale-110" />
              <div className="absolute inset-0 p-5 sm:p-6 flex flex-col justify-end text-white">
                <h4 className="font-bold text-lg">赛博朋克</h4>
                <p className="text-white/80 text-sm">霓虹闪烁的未来都市</p>
              </div>
            </div>

            <div className="group relative overflow-hidden rounded-2xl aspect-5/3 sm:aspect-4/3 md:aspect-video cursor-pointer border border-white/10 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 md:-mt-8">
              <div className="absolute inset-0 bg-linear-to-br from-emerald-400/80 via-teal-500/80 to-cyan-600/80 transition-transform duration-500 group-hover:scale-110" />
              <div className="absolute inset-0 p-5 sm:p-6 flex flex-col justify-end text-white">
                <h4 className="font-bold text-lg">自然奇观</h4>
                <p className="text-white/80 text-sm">壮丽的山川与湖泊</p>
              </div>
            </div>

            <div className="group relative overflow-hidden rounded-2xl aspect-5/3 sm:aspect-4/3 md:aspect-video cursor-pointer border border-white/10 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
              <div className="absolute inset-0 bg-linear-to-br from-orange-400/80 via-amber-500/80 to-yellow-500/80 transition-transform duration-500 group-hover:scale-110" />
              <div className="absolute inset-0 p-5 sm:p-6 flex flex-col justify-end text-white">
                <h4 className="font-bold text-lg">3D 艺术</h4>
                <p className="text-white/80 text-sm">极简主义渲染风格</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
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
            <p className="text-muted-foreground">管理您的图片生成任务</p>
          </div>
          <CreateTaskButton />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tasks.map((task) => {
            const hasImages = task.generatedImageUrls && task.generatedImageUrls.length > 0;
            const firstImage = hasImages ? task.generatedImageUrls[0] : null;
            const imageCount = task.generatedImageUrls?.length || 0;
            const hasOriginalImages = task.originalImageUrls && task.originalImageUrls.length > 0;
            const textToImageOverlay =
              !hasImages && !hasOriginalImages && task.type === 'text_to_image'
                ? getTextToImageOverlayCopy(task.status)
                : null;

            return (
              <Card key={task.id} className="group overflow-hidden transition-all hover:shadow-md">
                <div
                  className="aspect-square relative bg-muted overflow-hidden cursor-pointer"
                  onClick={() => handleOpenGallery(task)}
                >
                  {hasImages ? (
                    <>
                      <Image
                        src={firstImage!}
                        alt={`Generated`}
                        fill
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                        sizes={`(max-width: 768px) ${IMAGE_SIZES.MOBILE}, (max-width: 1024px) ${IMAGE_SIZES.TABLET}, (max-width: 1280px) ${IMAGE_SIZES.DESKTOP_MD}, ${IMAGE_SIZES.DESKTOP_LG}`}
                        priority={task.id === tasks[0]?.id}
                      />
                      {imageCount > 1 && (
                        <div className="absolute bottom-2 left-2 z-10">
                          <Badge variant="secondary" className="backdrop-blur-md">
                            {imageCount} 张
                          </Badge>
                        </div>
                      )}
                    </>
                  ) : hasOriginalImages ? (
                    <>
                      <Image
                        src={task.originalImageUrls[0]}
                        alt="Original"
                        fill
                        className="object-cover opacity-50 blur-sm"
                        sizes={`(max-width: 768px) ${IMAGE_SIZES.MOBILE}, (max-width: 1024px) ${IMAGE_SIZES.TABLET}, (max-width: 1280px) ${IMAGE_SIZES.DESKTOP_MD}, ${IMAGE_SIZES.DESKTOP_LG}`}
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Badge variant="secondary" className="backdrop-blur-md">
                          {task.status === 'pending' && '等待处理'}
                          {task.status === 'processing' && '生成中...'}
                        </Badge>
                      </div>
                    </>
                  ) : textToImageOverlay ? (
                    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden bg-muted">
                      <div className="absolute inset-0 bg-linear-to-br from-primary/20 via-purple-500/20 to-background opacity-70 animate-pulse" />
                      <div className="absolute inset-0 bg-background/70 backdrop-blur-md" />
                      <div className="relative z-10 flex flex-col items-center gap-2 px-6 text-center">
                        <ImageIcon className="h-10 w-10 text-muted-foreground/50" />
                        <Badge variant="secondary" className="bg-background/80 text-foreground">
                          {textToImageOverlay.label}
                        </Badge>
                        <p className="text-xs text-muted-foreground/80">
                          {textToImageOverlay.description}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <ImageIcon className="h-12 w-12 text-muted-foreground/20" />
                    </div>
                  )}

                  <div className="absolute top-2 right-2">
                    <Badge
                      variant={
                        task.status === 'success' || task.status === 'partial_success'
                          ? 'default'
                          : task.status === 'failed'
                            ? 'destructive'
                            : 'secondary'
                      }
                      className="shadow-sm"
                    >
                      {(task.status === 'success' || task.status === 'partial_success') && (
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                      )}
                      {task.status === 'failed' && <AlertCircle className="mr-1 h-3 w-3" />}
                      {task.status === 'pending' && (
                        <Clock className="mr-1 h-3 w-3 animate-pulse" />
                      )}
                      {task.status === 'processing' && (
                        <Clock className="mr-1 h-3 w-3 animate-spin" />
                      )}
                      <span className="capitalize">
                        {task.status === 'partial_success' ? '部分成功' : task.status}
                      </span>
                    </Badge>
                  </div>

                  {/* Hover overlay to view all images */}
                  {hasImages && (
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 flex items-center justify-center">
                      <div className="text-white text-sm font-medium">
                        {imageCount > 1 ? `查看全部 ${imageCount} 张` : '查看图片'}
                      </div>
                    </div>
                  )}
                </div>

                <CardContent className="p-4">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {task.type === 'text_to_image' ? '文生图' : '图生图'}
                      </span>
                      <span className="text-xs text-muted-foreground">#{task.id}</span>
                    </div>
                    <p
                      className="text-sm font-medium line-clamp-2 min-h-10"
                      title={task.userPrompt || '无提示词'}
                    >
                      {task.userPrompt || '无提示词'}
                    </p>
                  </div>
                </CardContent>
                <CardFooter className="p-4 pt-0 text-xs text-muted-foreground">
                  {new Date(task.createdAt).toLocaleString()}
                </CardFooter>
              </Card>
            );
          })}
        </div>

        {/* Image Gallery Modal */}
        {selectedTask && (
          <ImageGalleryModal
            open={isGalleryOpen}
            onOpenChange={setIsGalleryOpen}
            images={selectedTask.generatedImageUrls}
            taskName={selectedTask.name}
            taskId={selectedTask.id}
          />
        )}
      </div>
    </div>
  );
}
