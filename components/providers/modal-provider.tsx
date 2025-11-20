'use client'

import { createContext, useContext, useState, ReactNode } from 'react'
import { CreateTaskModal } from '@/components/modals/create-task-modal'
import { BillingModal } from '@/components/modals/billing-modal'

interface ModalContextType {
  setCreateTaskOpen: (open: boolean) => void
  setBillingOpen: (open: boolean) => void
}

const ModalContext = createContext<ModalContextType | undefined>(undefined)

export function ModalProvider({ children }: { children: ReactNode }) {
  const [isCreateTaskOpen, setCreateTaskOpen] = useState(false)
  const [isBillingOpen, setBillingOpen] = useState(false)

  return (
    <ModalContext.Provider value={{ setCreateTaskOpen, setBillingOpen }}>
      {children}
      <CreateTaskModal open={isCreateTaskOpen} onOpenChange={setCreateTaskOpen} />
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
