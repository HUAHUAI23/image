'use client'

import { Plus } from 'lucide-react'

import { useModal } from '@/components/providers/modal-provider'
import { Button, ButtonProps } from '@/components/ui/button'

interface CreateTaskButtonProps extends ButtonProps {
  children?: React.ReactNode
}

export function CreateTaskButton({ children, ...props }: CreateTaskButtonProps) {
  const { setCreateTaskOpen } = useModal()

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    e.preventDefault()
    setCreateTaskOpen(true)
  }

  return (
    <Button onClick={handleClick} {...props}>
      {children || (
        <>
          <Plus className="mr-2 h-4 w-4" />
          创建新任务
        </>
      )}
    </Button>
  )
}
