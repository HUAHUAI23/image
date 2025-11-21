'use client'

import { createContext, ReactNode,useContext, useState } from 'react'

import { BillingModal } from '@/components/modals/billing-modal'
import { CreateTaskModal } from '@/components/modals/create-task-modal'

interface ModalContextType {
  setCreateTaskOpen: (open: boolean) => void
  setBillingOpen: (open: boolean) => void
  setOnTaskSuccess: (callback: (() => void) | undefined) => void
}

const ModalContext = createContext<ModalContextType | undefined>(undefined)

export function ModalProvider({ children }: { children: ReactNode }) {
  const [isCreateTaskOpen, setCreateTaskOpen] = useState(false)
  const [isBillingOpen, setBillingOpen] = useState(false)
  const [onTaskSuccess, setOnTaskSuccess] = useState<(() => void) | undefined>()

  return (
    <ModalContext.Provider value={{ setCreateTaskOpen, setBillingOpen, setOnTaskSuccess }}>
      {children}
      <CreateTaskModal open={isCreateTaskOpen} onOpenChange={setCreateTaskOpen} onSuccess={onTaskSuccess} />
      <BillingModal open={isBillingOpen} onOpenChange={setBillingOpen} />
    </ModalContext.Provider>
  )
}

export function useModal() {
  const context = useContext(ModalContext)
  if (context === undefined) {
    throw new Error('useModal must be used within a ModalProvider')
  }
  return context
}
