'use client'

import * as React from 'react'
import { Plus } from 'lucide-react'

import { Button } from '@/components/animate-ui/components/buttons/button'
import { useModal } from '@/components/providers/modal-provider'

interface CreateTaskButtonProps {
  children?: React.ReactNode
  variant?: 'default' | 'accent' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm' | 'icon-lg'
  className?: string
  hoverScale?: number
  tapScale?: number
  disabled?: boolean
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
}

export function CreateTaskButton({
  children,
  hoverScale = 1.02,
  tapScale = 0.98,
  ...props
}: CreateTaskButtonProps) {
  const { setCreateTaskOpen } = useModal()

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    e.preventDefault()
    setCreateTaskOpen(true)
  }

  return (
    <Button
      onClick={handleClick}
      hoverScale={hoverScale}
      tapScale={tapScale}
      {...props}
    >
      {children || (
        <>
          <Plus className="mr-2 h-4 w-4" />
          创建新任务
        </>
      )}
    </Button>
  )
}
