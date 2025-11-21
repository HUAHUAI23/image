'use client'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { PhotoProvider, PhotoView } from 'react-photo-view'
import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Download, Eye, X, Grid3X3, Image as ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import 'react-photo-view/dist/react-photo-view.css'

interface ImageGalleryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  images: string[]
  taskName: string
  taskId: number
}

export function ImageGalleryModal({ open, onOpenChange, images, taskName, taskId }: ImageGalleryModalProps) {
  const handleDownload = async (url: string, index: number) => {
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `task-${taskId}-image-${index + 1}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(blobUrl)
    } catch (error) {
      console.error('Download failed:', error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1200px] h-[85vh] p-0 gap-0 overflow-hidden flex flex-col bg-background/95 shadow-2xl border-none ring-1 ring-white/10 backdrop-blur-xl">

        {/* Modern Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 shrink-0 bg-background/60 backdrop-blur-md z-10">
          <DialogTitle className="text-lg font-semibold flex items-center gap-3">
            <span className="truncate max-w-[400px]">{taskName}</span>
          </DialogTitle>

          <div className="flex items-center gap-2">
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

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto bg-muted/5 p-6 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
          <PhotoProvider
            maskOpacity={0.9}
            speed={() => 300}
            easing={(type) => (type === 2 ? 'cubic-bezier(0.36, 0, 0.66, -0.56)' : 'cubic-bezier(0.34, 1.56, 0.64, 1)')}
          >
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {images.map((imageUrl, index) => (
                <div
                  key={index}
                  className="group relative aspect-[4/5] md:aspect-square rounded-xl overflow-hidden border border-border/50 bg-background shadow-sm hover:shadow-lg transition-all duration-300"
                >
                  <PhotoView src={imageUrl}>
                    <div className="w-full h-full cursor-zoom-in">
                      <Image
                        src={imageUrl}
                        alt={`${taskName} - 图片 ${index + 1}`}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                      />
                    </div>
                  </PhotoView>

                  {/* Overlay Actions */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4 pointer-events-none">
                    <div className="flex items-center justify-between translate-y-2 group-hover:translate-y-0 transition-transform duration-300 delay-75 pointer-events-auto">
                      <Badge className="bg-black/50 hover:bg-black/70 text-white border-0 backdrop-blur-sm text-xs h-7 px-2.5 font-normal gap-1.5">
                        <ImageIcon className="w-3 h-3" />
                        #{index + 1}
                      </Badge>

                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          size="icon"
                          className="h-8 w-8 rounded-full bg-white/90 hover:bg-white text-black shadow-sm backdrop-blur-sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDownload(imageUrl, index)
                          }}
                          title="下载原图"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        {/* PhotoView trigger is handled by the wrapping component, but visual cue is nice */}
                        <div className="pointer-events-none">
                           {/* This is just for visual balance if needed, currently just download button */}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </PhotoProvider>

          {images.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-4">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                <ImageIcon className="w-8 h-8 opacity-50" />
              </div>
              <p>暂无图片预览</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
