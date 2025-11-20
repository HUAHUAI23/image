'use client'

import { Button, ButtonProps } from '@/components/ui/button'
import { useModal } from '@/components/providers/modal-provider'
import { Plus } from 'lucide-react'

interface CreateTaskButtonProps extends ButtonProps {
  children?: React.ReactNode
}

export function CreateTaskButton({ children, ...props }: CreateTaskButtonProps) {
  const { setCreateTaskOpen } = useModal()

  return (
    <Button onClick={() => setCreateTaskOpen(true)} {...props}>
      {children || (
        <>
          <Plus className="mr-2 h-4 w-4" />
          创建新任务
        </>
      )}
    </Button>
  )
}
