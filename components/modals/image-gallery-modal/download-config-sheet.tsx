'use client';

import {
  Archive,
  Download,
  FileImage,
  Loader2,
  Maximize,
  RefreshCcw,
  Settings2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { buildProcessQuery, ImageProcessConfig } from '@/lib/image-process';
import { cn } from '@/lib/utils';

interface DownloadConfigSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: ImageProcessConfig;
  onConfigChange: (config: ImageProcessConfig) => void;
  selectedCount: number;
  downloading: boolean;
  onDownload: () => void;
  onReset: () => void;
}

export function DownloadConfigSheet({
  open,
  onOpenChange,
  config,
  onConfigChange,
  selectedCount,
  downloading,
  onDownload,
  onReset,
}: DownloadConfigSheetProps) {
  const updateConfig = (updates: Partial<ImageProcessConfig>) => {
    onConfigChange({ ...config, ...updates });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md p-0 flex flex-col h-full max-h-dvh bg-background shadow-2xl border-l border-border outline-none">
        <SheetHeader className="px-6 py-5 border-b border-border/50 bg-muted/30 shrink-0 flex-none">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Settings2 className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <SheetTitle className="text-lg font-bold">下载配置</SheetTitle>
              <SheetDescription className="text-xs">
                自定义 {selectedCount} 张图片的处理参数
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 min-h-0 relative">
          <ScrollArea className="h-full w-full">
            <div className="px-6 py-6 space-y-8 pb-24">
              {/* Section: Resize */}
              <div className="space-y-5">
                <div className="flex items-center gap-2 pb-2 border-b border-border/50">
                  <Maximize className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">尺寸调整</h3>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div className="p-4 bg-muted/30 rounded-xl space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium flex items-center gap-2 text-foreground">
                        <span className="w-1 h-3 bg-primary/50 rounded-full" />
                        固定尺寸 (Resize)
                      </Label>
                      <p className="text-[10px] text-muted-foreground pl-3">
                        强制调整为指定分辨率，可能会改变宽高比
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="relative flex-1">
                        <Input
                          type="number"
                          className="h-10 pl-8 pr-8 bg-background/50 focus:bg-background transition-colors"
                          min={1}
                          value={config.width ?? ''}
                          onChange={(e) =>
                            updateConfig({
                              width: e.target.value ? parseInt(e.target.value) : null,
                            })
                          }
                        />
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">
                          W
                        </span>
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          px
                        </span>
                      </div>
                      <span className="text-muted-foreground/40">×</span>
                      <div className="relative flex-1">
                        <Input
                          type="number"
                          className="h-10 pl-8 pr-8 bg-background/50 focus:bg-background transition-colors"
                          min={1}
                          value={config.height ?? ''}
                          onChange={(e) =>
                            updateConfig({
                              height: e.target.value ? parseInt(e.target.value) : null,
                            })
                          }
                        />
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">
                          H
                        </span>
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          px
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-muted/30 rounded-xl space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium flex items-center gap-2 text-foreground">
                        <span className="w-1 h-3 bg-primary/50 rounded-full" />
                        限制边长 (Limit)
                      </Label>
                      <p className="text-[10px] text-muted-foreground pl-3">
                        保持原图比例，仅当图片超过设定值时缩小
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="relative flex-1">
                        <Input
                          type="number"
                          placeholder="长边"
                          className="h-10 pr-8 bg-background/50 focus:bg-background transition-colors placeholder:text-muted-foreground/40"
                          min={1}
                          value={config.longEdge ?? ''}
                          onChange={(e) =>
                            updateConfig({
                              longEdge: e.target.value ? parseInt(e.target.value) : null,
                            })
                          }
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          px
                        </span>
                      </div>
                      <div className="relative flex-1">
                        <Input
                          type="number"
                          placeholder="短边"
                          className="h-10 pr-8 bg-background/50 focus:bg-background transition-colors placeholder:text-muted-foreground/40"
                          min={1}
                          value={config.shortEdge ?? ''}
                          onChange={(e) =>
                            updateConfig({
                              shortEdge: e.target.value ? parseInt(e.target.value) : null,
                            })
                          }
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          px
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-muted/30 rounded-xl p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">百分比缩放</Label>
                    <span className="text-xs font-mono bg-background border px-1.5 py-0.5 rounded text-foreground">
                      {config.percentage ?? 100}%
                    </span>
                  </div>
                  <Slider
                    defaultValue={[100]}
                    value={[config.percentage ?? 100]}
                    max={200}
                    min={1}
                    step={1}
                    onValueChange={(vals) => updateConfig({ percentage: vals[0] })}
                    className="py-1"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {config.percentage && config.percentage > 100
                      ? '注意：放大图片可能导致模糊'
                      : '提示：缩小图片可有效减小文件体积'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">缩放模式</Label>
                  <Select
                    value={config.mode ?? 'none'}
                    onValueChange={(v) => updateConfig({ mode: v === 'none' ? null : (v as any) })}
                  >
                    <SelectTrigger className="h-9 bg-muted/30">
                      <SelectValue placeholder="选择缩放模式" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">默认 (不处理)</SelectItem>
                      <SelectItem value="lfit">等比缩放 (lfit) - 限制在框内</SelectItem>
                      <SelectItem value="mfit">延伸缩放 (mfit) - 填满并延伸</SelectItem>
                      <SelectItem value="fill">居中裁剪 (fill) - 填满并裁剪</SelectItem>
                      <SelectItem value="pad">填充模式 (pad) - 填满加背景</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {config.mode === 'pad' && (
                  <div className="space-y-2 animate-in slide-in-from-top-2 fade-in">
                    <Label className="text-xs text-muted-foreground">填充背景色 (Hex)</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <div
                          className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border shadow-sm"
                          style={{ backgroundColor: `#${config.color || 'FFFFFF'}` }}
                        />
                        <Input
                          placeholder="FFFFFF"
                          maxLength={6}
                          className="pl-9 h-9 bg-muted/30 font-mono uppercase"
                          value={config.color}
                          onChange={(e) =>
                            updateConfig({
                              color: e.target.value.replace(/[^0-9A-Fa-f]/g, ''),
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-start space-x-3 pt-2">
                  <Checkbox
                    id="limit"
                    checked={config.limit === 1}
                    onCheckedChange={(checked) => updateConfig({ limit: checked ? 1 : 0 })}
                    className="mt-0.5 border-muted-foreground/30"
                  />
                  <div className="grid gap-1 leading-none">
                    <Label
                      htmlFor="limit"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      防止放大失真
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      如果目标尺寸大于原图，则保持原图尺寸
                    </p>
                  </div>
                </div>
              </div>

              {/* Section: Format */}
              <div className="space-y-5">
                <div className="flex items-center gap-2 pb-2 border-b border-border/50">
                  <FileImage className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">格式与质量</h3>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-3">
                    <Label className="text-xs text-muted-foreground">输出格式</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: 'none', label: '原图' },
                        { value: 'webp', label: 'WebP' },
                        { value: 'jpg', label: 'JPG' },
                      ].map((fmt) => (
                        <div
                          key={fmt.value}
                          className={cn(
                            'flex items-center justify-center h-9 rounded-md border cursor-pointer text-sm transition-all duration-200',
                            config.compress === (fmt.value === 'none' ? undefined : fmt.value) ||
                              (fmt.value === 'none' && !config.compress)
                              ? 'bg-primary text-primary-foreground border-primary font-medium shadow-md scale-[1.02]'
                              : 'bg-background hover:bg-muted border-input hover:border-primary/30'
                          )}
                          onClick={() =>
                            updateConfig({
                              compress: fmt.value === 'none' ? undefined : (fmt.value as any),
                            })
                          }
                        >
                          {fmt.label}
                        </div>
                      ))}
                    </div>
                  </div>

                  {config.compress && config.compress !== 'none' && (
                    <div className="bg-muted/30 rounded-xl p-4 space-y-4 animate-in slide-in-from-top-2 fade-in">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium">压缩质量 (Q)</Label>
                        <span className="text-xs font-mono bg-background border px-1.5 py-0.5 rounded text-foreground">
                          {config.quality ?? 85}
                        </span>
                      </div>
                      <Slider
                        defaultValue={[85]}
                        value={[config.quality ?? 85]}
                        max={100}
                        min={1}
                        step={1}
                        onValueChange={(vals) => updateConfig({ quality: vals[0] })}
                        className="py-1"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Preview Query Badge */}
              {buildProcessQuery(config) && (
                <div className="pt-4 border-t border-border/50">
                  <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                    <Archive className="w-3 h-3" />
                    <span>处理参数预览</span>
                  </div>
                  <code className="block w-full text-[10px] text-muted-foreground/70 bg-muted/20 p-2 rounded border border-border/50 break-all font-mono">
                    ?x-tos-process={buildProcessQuery(config)}
                  </code>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="p-6 bg-background/80 backdrop-blur-md border-t border-border shrink-0 flex-none z-20 shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.1)] safe-area-bottom space-y-3">
          <Button
            className="w-full h-12 text-base shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all rounded-xl"
            onClick={onDownload}
            disabled={downloading}
          >
            {downloading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                处理中...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                开始批量下载
              </>
            )}
          </Button>

          <Button
            variant="ghost"
            className="w-full text-muted-foreground hover:text-foreground h-9 hover:bg-muted/50"
            onClick={onReset}
            disabled={downloading}
          >
            <RefreshCcw className="w-3.5 h-3.5 mr-2" />
            重置所有参数
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
