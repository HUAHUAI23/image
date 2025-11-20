'use client'

import { getBalanceAction, getTransactionsAction } from '@/app/actions/billing'
import { Badge } from '@/components/ui/badge'
import { Wallet, TrendingDown, Receipt, CreditCard, Loader2, ArrowUpRight, ArrowDownLeft, Clock } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface Transaction {
  id: number
  type: string
  amount: number
  balanceAfter: number
  taskId: number | null
  createdAt: Date
}

interface BillingModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function BillingModal({ open, onOpenChange }: BillingModalProps) {
  const [balance, setBalance] = useState<number>(0)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (open) {
      setLoading(true)
      Promise.all([
        getBalanceAction(),
        getTransactionsAction()
      ]).then(([bal, txs]) => {
        setBalance(bal)
        setTransactions(txs as any[])
        setLoading(false)
      })
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] p-0 overflow-hidden border-none shadow-2xl bg-background/95 backdrop-blur-sm">
        <DialogHeader className="px-6 py-6 border-b bg-muted/20 space-y-1">
          <DialogTitle className="text-xl font-semibold flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            账单 & 余额
          </DialogTitle>
          <DialogDescription>
            管理您的账户余额与交易明细
          </DialogDescription>
        </DialogHeader>

        {loading ? (
            <div className="flex h-[400px] w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        ) : (
            <div className="flex flex-col h-[500px]">
                {/* Cards Section */}
                <div className="p-6 grid grid-cols-2 gap-4 shrink-0">
                    <div className="rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border p-5 relative overflow-hidden group">
                        <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity group-hover:scale-110 duration-500">
                            <Wallet className="w-24 h-24 -mr-8 -mt-8" />
                        </div>
                        <div className="relative">
                            <p className="text-sm font-medium text-muted-foreground mb-1">当前余额</p>
                            <div className="text-3xl font-bold text-primary">
                                ¥ {balance.toFixed(2)}
                            </div>
                            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                                <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                                账户状态正常
                            </p>
                        </div>
                    </div>

                    <div className="rounded-xl bg-muted/30 border p-5 relative overflow-hidden group hover:bg-muted/50 transition-colors">
                         <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity group-hover:scale-110 duration-500">
                            <TrendingDown className="w-24 h-24 -mr-8 -mt-8" />
                        </div>
                        <div className="relative">
                            <p className="text-sm font-medium text-muted-foreground mb-1">总支出</p>
                            <div className="text-3xl font-bold text-foreground">
                                ¥ {transactions.filter(t => t.type === 'charge').reduce((acc, t) => acc + t.amount, 0).toFixed(2)}
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                                累计消费金额
                            </p>
                        </div>
                    </div>
                </div>

                {/* Transactions List */}
                <div className="flex-1 overflow-hidden flex flex-col border-t">
                    <div className="px-6 py-3 bg-muted/10 border-b flex items-center justify-between shrink-0">
                        <h3 className="text-sm font-medium flex items-center gap-2">
                            <Receipt className="w-4 h-4 text-muted-foreground" />
                            交易记录
                        </h3>
                    </div>

                    <div className="overflow-y-auto flex-1 p-0">
                        {transactions.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-8">
                                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                                    <CreditCard className="h-8 w-8 opacity-20" />
                                </div>
                                <p>暂无交易记录</p>
                            </div>
                        ) : (
                            <div className="divide-y">
                                {transactions.map((tx) => (
                                    <div key={tx.id} className="px-6 py-4 flex items-center justify-between hover:bg-muted/5 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className={cn(
                                                "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                                                tx.type === 'charge' ? "bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400" : "bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400"
                                            )}>
                                                {tx.type === 'charge' ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium">
                                                        {tx.type === 'charge' ? '任务消费' : '账户充值'}
                                                    </span>
                                                    {tx.taskId && (
                                                        <Badge variant="secondary" className="text-[10px] px-1 h-5 font-mono">
                                                            TASK-{tx.taskId}
                                                        </Badge>
                                                    )}
                                                </div>
                                                <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                                    <Clock className="w-3 h-3" />
                                                    {new Date(tx.createdAt).toLocaleString()}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className={cn(
                                                "font-semibold",
                                                tx.type === 'charge' ? "text-foreground" : "text-green-600 dark:text-green-400"
                                            )}>
                                                {tx.type === 'charge' ? '-' : '+'}¥{tx.amount.toFixed(2)}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                余额 ¥{tx.balanceAfter.toFixed(2)}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
