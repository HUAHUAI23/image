/**
 * Create Task Modal - Reusable Components
 *
 * 创建任务模态框的可复用UI组件
 * 包含动画标签、图片模式切换等辅助组件
 */

import { Image as ImageIcon, Layers } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

import { cn } from '@/lib/utils'

import { AnimatedLabelProps, ImageModeToggleProps } from './types'

// ==================== 动画组件 ====================

/**
 * 动画标签组件
 * 用于文本切换时的平滑过渡动画
 */
export function AnimatedLabel({ children, animationKey }: AnimatedLabelProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={animationKey}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.2 }}
      >
        {children}
      </motion.span>
    </AnimatePresence>
  )
}

/**
 * 动画单位标签
 * 用于批次/张数单位切换时的动画效果
 */
export function AnimatedUnit({ children, animationKey }: AnimatedLabelProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={animationKey}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.15 }}
        className="text-sm text-muted-foreground"
      >
        {children}
      </motion.span>
    </AnimatePresence>
  )
}

// ==================== 图片模式组件 ====================

/**
 * 图片模式切换组件
 * 支持单图模式和多图模式的切换
 * 带有滑动背景高亮动画效果
 */
export function ImageModeToggle({
  mode,
  onModeChange,
  onSwitchToSingle,
}: ImageModeToggleProps) {
  return (
    <div className="relative grid grid-cols-2 p-1 bg-muted/50 rounded-lg border">
      {/* 动画背景高亮 */}
      <motion.div
        className="absolute inset-1 bg-background rounded-md shadow-sm border border-transparent dark:border-input dark:bg-input/30"
        initial={false}
        animate={{ x: mode === 'single' ? '0%' : '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={{ width: 'calc(50% - 4px)' }}
      />

      {/* 单图模式按钮 */}
      <button
        type="button"
        onClick={() => {
          if (mode !== 'single') {
            onSwitchToSingle?.()
            onModeChange('single')
          }
        }}
        className={cn(
          'relative z-10 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-colors duration-300',
          mode === 'single' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <ImageIcon className="w-3.5 h-3.5" />
        单图模式
      </button>

      {/* 多图模式按钮 */}
      <button
        type="button"
        onClick={() => onModeChange('multi')}
        className={cn(
          'relative z-10 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-colors duration-300',
          mode === 'multi' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <Layers className="w-3.5 h-3.5" />
        多图模式
      </button>
    </div>
  )
}
