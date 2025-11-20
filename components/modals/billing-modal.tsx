'use client'

import { getBalanceAction, getTransactionsAction } from '@/app/actions/billing'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Wallet, TrendingDown, Receipt, CreditCard, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useEffect, useState } from 'react'

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
        // Convert date strings back to Date objects if needed, though server actions usually serialize dates to strings or keep them if using superjson (Next.js handles simple JSON serialization)
        // Drizzle returns Date objects, Next.js server actions serialize them.
        // We might need to parse them. Let's assume they come as dates or strings we can pass to new Date()
        setTransactions(txs as any[])
        setLoading(false)
      })
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>账单 & 余额</DialogTitle>
          <DialogDescription>
            查看您的账户余额和交易历史记录
          </DialogDescription>
        </DialogHeader>

        {loading ? (
            <div className="flex h-[300px] w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        ) : (
            <div className="space-y-8 py-4">
                <div className="grid gap-6 md:grid-cols-2">
                    <Card className="bg-primary text-primary-foreground shadow-lg">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">当前余额</CardTitle>
                            <Wallet className="h-4 w-4 opacity-75" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-4xl font-bold">¥ {balance.toFixed(2)}</div>
                            <p className="text-xs opacity-75 mt-1">
                                可用于创建新任务
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">总支出</CardTitle>
                            <TrendingDown className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                ¥ {transactions.filter(t => t.type === 'charge').reduce((acc, t) => acc + t.amount, 0).toFixed(2)}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                累计消费金额
                            </p>
                        </CardContent>
                    </Card>
                </div>

                <div className="border rounded-lg">
                    <div className="p-4 border-b bg-muted/30 flex items-center justify-between">
                        <div>
                            <h3 className="font-medium">交易记录</h3>
                            <p className="text-sm text-muted-foreground">最近的充值与消费明细</p>
                        </div>
                    </div>
                    <div className="p-0">
                        {transactions.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                                <CreditCard className="h-12 w-12 mb-4 opacity-20" />
                                <p>暂无交易记录</p>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[100px]">ID</TableHead>
                                    <TableHead>类型</TableHead>
                                    <TableHead>任务关联</TableHead>
                                    <TableHead>变动金额</TableHead>
                                    <TableHead>变动后余额</TableHead>
                                    <TableHead className="text-right">时间</TableHead>
                                </TableRow>
                                </TableHeader>
                                <TableBody>
                                {transactions.map((tx) => (
                                    <TableRow key={tx.id}>
                                    <TableCell className="font-medium">#{tx.id}</TableCell>
                                    <TableCell>
                                        <Badge variant={tx.type === 'charge' ? 'outline' : 'secondary'} className={
                                            tx.type === 'charge'
                                                ? 'border-red-200 text-red-700 bg-red-50 dark:bg-red-900/10 dark:text-red-400 dark:border-red-800'
                                                : 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                                        }>
                                            {tx.type === 'charge' ? '扣费' : '退款'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        {tx.taskId ? (
                                            <span className="font-mono text-xs">Task #{tx.taskId}</span>
                                        ) : '-'}
                                    </TableCell>
                                    <TableCell className={tx.type === 'charge' ? 'text-red-600 dark:text-red-400 font-medium' : 'text-green-600 dark:text-green-400 font-medium'}>
                                        {tx.type === 'charge' ? '-' : '+'}{tx.amount.toFixed(2)}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                        ¥{tx.balanceAfter.toFixed(2)}
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground text-xs">
                                        {new Date(tx.createdAt).toLocaleString()}
                                    </TableCell>
                                    </TableRow>
                                ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                </div>
            </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
