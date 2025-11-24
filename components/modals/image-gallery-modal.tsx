'use client';

import { useEffect, useState } from 'react';
import { PhotoProvider, PhotoView } from 'react-photo-view';
import { Check, CheckCircle2, CheckSquare, Download, Image as ImageIcon, X } from 'lucide-react';
import Image from 'next/image';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  GalleryDialog,
  GalleryDialogContent,
  GalleryDialogTitle,
} from '@/components/ui/gallery-dialog';
import { Separator } from '@/components/ui/separator';
import { batchDownloadAsZip, DownloadProgress, downloadSingleImage } from '@/lib/batch-download';
import { DEFAULT_IMAGE_PROCESS_CONFIG, ImageProcessConfig } from '@/lib/image-process';
import { cn } from '@/lib/utils';

import { DownloadConfigSheet } from './image-gallery-modal/download-config-sheet';

import 'react-photo-view/dist/react-photo-view.css';

interface ImageGalleryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: string[];
  taskName: string;
  taskId: number;
}

export function ImageGalleryModal({
  open,
  onOpenChange,
  images,
  taskName,
  taskId,
}: ImageGalleryModalProps) {
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState<ImageProcessConfig>(DEFAULT_IMAGE_PROCESS_CONFIG);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [photoViewVisible, setPhotoViewVisible] = useState(false);

  // Reset selection mode when dialog closes
  useEffect(() => {
    if (!open) {
      setIsSelectionMode(false);
      setSelectedIndices(new Set());
    }
  }, [open]);

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && photoViewVisible) {
      return;
    }
    onOpenChange(nextOpen);
  };

  const toggleSelection = (index: number) => {
    const newSelection = new Set(selectedIndices);
    if (newSelection.has(index)) {
      newSelection.delete(index);
    } else {
      newSelection.add(index);
    }
    setSelectedIndices(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedIndices.size === images.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(images.map((_, i) => i)));
    }
  };

  const handleSingleDownload = async (url: string, index: number) => {
    try {
      await downloadSingleImage(url, index, taskId);
      toast.success('图片下载成功');
    } catch (error) {
      console.error('Download failed:', error);
      toast.error('下载失败，请稍后重试');
    }
  };

  const handleBatchDownload = async () => {
    if (selectedIndices.size === 0) {
      toast.error('请先选择要下载的图片');
      return;
    }

    setDownloading(true);
    setDownloadProgress(null);

    try {
      const result = await batchDownloadAsZip(
        images,
        Array.from(selectedIndices).sort((a, b) => a - b),
        config,
        taskId,
        taskName,
        (progress) => setDownloadProgress(progress)
      );

      if (result.failCount === 0) {
        toast.success(`成功下载 ${result.successCount} 张图片`);
      } else {
        toast.warning(`成功 ${result.successCount} 张，失败 ${result.failCount} 张`);
      }

      setShowConfig(false);
      setIsSelectionMode(false);
      setSelectedIndices(new Set());
    } catch (error) {
      console.error('Batch download failed:', error);
      toast.error('批量下载失败，请稍后重试');
    } finally {
      setDownloading(false);
      setDownloadProgress(null);
    }
  };

  const resetConfig = () => {
    setConfig(DEFAULT_IMAGE_PROCESS_CONFIG);
  };

  return (
    <>
      <GalleryDialog open={open} onOpenChange={handleDialogOpenChange} modal={!photoViewVisible}>
        <GalleryDialogContent
          showCloseButton={false}
          className="sm:max-w-[1200px] h-[85vh] p-0 gap-0 overflow-hidden flex flex-col bg-background/95 shadow-2xl border-none ring-1 ring-white/10 backdrop-blur-xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 shrink-0 bg-background/60 backdrop-blur-md z-10">
            <GalleryDialogTitle className="text-lg font-semibold flex items-center gap-3">
              <span className="truncate max-w-[300px] md:max-w-[500px]">{taskName}</span>
              <Badge variant="outline" className="font-normal text-muted-foreground">
                {images.length} 张图片
              </Badge>
            </GalleryDialogTitle>

            <div className="flex items-center gap-3">
              {images.length > 0 && (
                <>
                  {isSelectionMode ? (
                    <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-200">
                      <Button variant="ghost" size="sm" onClick={() => setIsSelectionMode(false)}>
                        取消
                      </Button>
                      <Separator orientation="vertical" className="h-4" />
                      <Button variant="ghost" size="sm" onClick={toggleSelectAll}>
                        {selectedIndices.size === images.length ? '取消全选' : '全选'}
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        className="gap-2 min-w-[100px]"
                        disabled={selectedIndices.size === 0}
                        onClick={() => setShowConfig(true)}
                      >
                        <Download className="w-4 h-4" />
                        下载 ({selectedIndices.size})
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => setIsSelectionMode(true)}
                    >
                      <CheckSquare className="w-4 h-4" />
                      批量管理
                    </Button>
                  )}
                </>
              )}

              <div className="w-px h-4 bg-border mx-1" />

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full hover:bg-muted"
                onClick={() => onOpenChange(false)}
              >
                <X className="w-4 h-4" />
                <span className="sr-only">关闭</span>
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto bg-muted/5 p-6 md:p-10 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
            {images.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-4">
                <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                  <ImageIcon className="w-8 h-8 opacity-50" />
                </div>
                <p>暂无图片预览</p>
              </div>
            ) : (
              <PhotoProvider
                maskOpacity={0.9}
                onVisibleChange={(visible) => setPhotoViewVisible(visible)}
                speed={() => 400}
                easing={(type) =>
                  type === 2
                    ? 'cubic-bezier(0.36, 0, 0.66, -0.56)'
                    : 'cubic-bezier(0.34, 1.56, 0.64, 1)'
                }
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8 max-w-7xl mx-auto">
                  {images.map((imageUrl, index) => {
                    const isSelected = selectedIndices.has(index);
                    return (
                      <div
                        key={index}
                        className={cn(
                          'group relative aspect-square rounded-2xl overflow-hidden border bg-background transition-all duration-500 select-none',
                          isSelectionMode && isSelected
                            ? 'ring-4 ring-primary/20 border-primary shadow-xl scale-[0.98]'
                            : 'border-border/40 hover:border-border/80 hover:shadow-2xl hover:-translate-y-1',
                          isSelectionMode && 'cursor-pointer active:scale-95'
                        )}
                        onClick={() => {
                          if (isSelectionMode) {
                            toggleSelection(index);
                          }
                        }}
                      >
                        {/* Selection Mode: Overlay & Checkbox */}
                        {isSelectionMode && (
                          <>
                            <div
                              className={cn(
                                'absolute inset-0 z-20 transition-colors duration-300',
                                isSelected ? 'bg-primary/5' : 'group-hover:bg-black/5'
                              )}
                            />
                            <div className="absolute top-4 left-4 z-30">
                              <div
                                className={cn(
                                  'w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 shadow-sm',
                                  isSelected
                                    ? 'bg-primary text-primary-foreground scale-100 shadow-primary/30'
                                    : 'bg-white/90 backdrop-blur-sm border border-black/10 scale-90 opacity-60 group-hover:opacity-100 group-hover:scale-100'
                                )}
                              >
                                {isSelected ? (
                                  <Check className="w-5 h-5 stroke-3" />
                                ) : (
                                  <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />
                                )}
                              </div>
                            </div>
                          </>
                        )}

                        {/* Image Content */}
                        {isSelectionMode ? (
                          // In selection mode, just an image, no PhotoView trigger (handled by parent click)
                          <div className="w-full h-full relative">
                            <Image
                              src={imageUrl}
                              alt={`${taskName} - 图片 ${index + 1}`}
                              fill
                              className={cn(
                                'object-cover transition-transform duration-700 ease-out',
                                isSelected ? 'scale-105' : 'group-hover:scale-105'
                              )}
                              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                            />
                          </div>
                        ) : (
                          // Default mode: PhotoView trigger
                          <PhotoView src={imageUrl}>
                            <div className="w-full h-full cursor-zoom-in relative">
                              <Image
                                src={imageUrl}
                                alt={`${taskName} - 图片 ${index + 1}`}
                                fill
                                className="object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                              />
                            </div>
                          </PhotoView>
                        )}

                        {/* Default Mode: Hover Actions */}
                        {!isSelectionMode && (
                          <div className="absolute inset-0 pointer-events-none flex flex-col justify-end p-4 md:p-6 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
                            <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent opacity-80" />
                            <div className="flex items-center justify-between translate-y-4 group-hover:translate-y-0 transition-transform duration-500 ease-out relative z-20 pointer-events-auto">
                              <Badge
                                variant="secondary"
                                className="bg-white/20 text-white border-white/20 backdrop-blur-md h-8 px-3 font-medium shadow-sm"
                              >
                                #{index + 1}
                              </Badge>

                              <Button
                                size="icon"
                                className="h-10 w-10 rounded-full bg-white text-black hover:bg-white hover:scale-110 shadow-lg transition-all duration-300"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSingleDownload(imageUrl, index);
                                }}
                                title="下载原图"
                              >
                                <Download className="w-5 h-5" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </PhotoProvider>
            )}
          </div>

          {/* Download Progress Overlay */}
          {downloading && downloadProgress && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-300">
              <div className="bg-card border border-border rounded-xl p-8 shadow-2xl max-w-md w-full mx-6 space-y-6">
                <div className="text-center space-y-2">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary mb-2">
                    {downloadProgress.stage === 'complete' ? (
                      <CheckCircle2 className="w-6 h-6" />
                    ) : (
                      <Download className="w-6 h-6 animate-bounce" />
                    )}
                  </div>
                  <h3 className="text-xl font-semibold tracking-tight">
                    {downloadProgress.stage === 'downloading' && '正在下载图片...'}
                    {downloadProgress.stage === 'zipping' && '正在打包文件...'}
                    {downloadProgress.stage === 'complete' && '准备完成！'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    正在为您处理选中的 {selectedIndices.size} 张图片，请稍候
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <span>进度</span>
                    <span>
                      {Math.round((downloadProgress.current / downloadProgress.total) * 100)}%
                    </span>
                  </div>
                  <div className="h-2 w-full bg-muted overflow-hidden rounded-full">
                    <div
                      className="h-full bg-primary transition-all duration-500 ease-out"
                      style={{
                        width: `${(downloadProgress.current / downloadProgress.total) * 100}%`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-center text-muted-foreground pt-2 font-mono">
                    {downloadProgress.filename}
                  </p>
                </div>
              </div>
            </div>
          )}
        </GalleryDialogContent>
      </GalleryDialog>

      {/* Download Configuration Sheet */}
      <DownloadConfigSheet
        open={showConfig}
        onOpenChange={setShowConfig}
        config={config}
        onConfigChange={setConfig}
        selectedCount={selectedIndices.size}
        downloading={downloading}
        onDownload={handleBatchDownload}
        onReset={resetConfig}
      />
    </>
  );
}
