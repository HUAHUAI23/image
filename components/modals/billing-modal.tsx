'use client'

import { useEffect, useState } from 'react'
import { type DateRange } from 'react-day-picker'
import { zhCN } from 'date-fns/locale'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Calendar as CalendarIcon,
  Download,
  History,
  LayoutDashboard,
  Loader2,
  Plus,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import {
  type AnalysisDataPoint,
  type BillingSummary,
  getBalanceAction,
  getBillingSummaryAction,
  getConsumptionAnalysisAction,
  getRechargeAnalysisAction,
  getTransactionsAction,
} from '@/app/actions/billing'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fenToYuan, formatCurrency } from '@/lib/const'
import { cn } from '@/lib/utils'

interface Transaction {
  id: number
  category: 'task_charge' | 'task_refund' | 'analysis_charge' | 'recharge'
  amount: number
  balanceAfter: number
  taskId: number | null
  paymentMethod?: string
  rechargeStatus?: string
  metadata?: {
    description?: string
    expectedCount?: number
    actualCount?: number
    refundReason?: string
  }
  createdAt: Date
}

interface BillingModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Helper to get category display info
function getCategoryInfo(category: Transaction['category']) {
  switch (category) {
    case 'task_charge':
      return { label: '任务消费', icon: ArrowDownLeft, color: 'text-orange-500', bg: 'bg-orange-500/10' }
    case 'task_refund':
      return { label: '任务退款', icon: ArrowUpRight, color: 'text-green-500', bg: 'bg-green-500/10' }
    case 'analysis_charge':
      return { label: '分析费用', icon: ArrowDownLeft, color: 'text-blue-500', bg: 'bg-blue-500/10' }
    case 'recharge':
      return { label: '账户充值', icon: ArrowUpRight, color: 'text-emerald-500', bg: 'bg-emerald-500/10' }
  }
}

export function BillingModal({ open, onOpenChange }: BillingModalProps) {
  const [activeTab, setActiveTab] = useState('overview')
  const [data, setData] = useState<{
    balance: number
    summary: BillingSummary
    transactions: Transaction[]
    consumptionData: AnalysisDataPoint[]
    rechargeData: AnalysisDataPoint[]
    isLoading: boolean
  }>({
    balance: 0,
    summary: { totalConsumption: 0, totalRecharge: 0 },
    transactions: [],
    consumptionData: [],
    rechargeData: [],
    isLoading: true,
  })

  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 30) // Default: last 30 days
    return { from: start, to: end }
  })

  const { balance, summary, transactions, consumptionData, rechargeData, isLoading } = data

  useEffect(() => {
    if (!open) return

    const fetchData = async () => {
      setData((prev) => ({ ...prev, isLoading: true }))

      try {
        const startDate = dateRange?.from?.toISOString()
        const endDate = dateRange?.to?.toISOString()

        const [bal, sum, txs, consumption, recharge] = await Promise.all([
          getBalanceAction(),
          getBillingSummaryAction(startDate, endDate),
          getTransactionsAction(startDate, endDate),
          startDate && endDate
            ? getConsumptionAnalysisAction(startDate, endDate)
            : Promise.resolve([]),
          startDate && endDate
            ? getRechargeAnalysisAction(startDate, endDate)
            : Promise.resolve([]),
        ])

        setData({
          balance: bal,
          summary: sum,
          transactions: txs as Transaction[],
          consumptionData: consumption,
          rechargeData: recharge,
          isLoading: false,
        })
      } catch (error) {
        console.error('Failed to fetch billing data:', error)
        setData((prev) => ({ ...prev, isLoading: false }))
      }
    }

    fetchData()
  }, [open, dateRange])

  // Prepare chart data
  const chartData = (() => {
    const dateMap = new Map<string, { date: string; consumption: number; recharge: number }>()

    consumptionData.forEach(({ date, amount }) => {
      const existing = dateMap.get(date) || { date, consumption: 0, recharge: 0 }
      existing.consumption = fenToYuan(amount)
      dateMap.set(date, existing)
    })

    rechargeData.forEach(({ date, amount }) => {
      const existing = dateMap.get(date) || { date, consumption: 0, recharge: 0 }
      existing.recharge = fenToYuan(amount)
      dateMap.set(date, existing)
    })

    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date))
  })()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] h-[85vh] p-0 gap-0 overflow-hidden bg-background/95 backdrop-blur-xl border-border/50 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold">费用中心</DialogTitle>
            </div>
          </div>
          <div className="flex items-center gap-2 mr-8">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-9 text-xs font-normal',
                    !dateRange && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {dateRange.from.toLocaleDateString()} - {dateRange.to.toLocaleDateString()}
                      </>
                    ) : (
                      dateRange.from.toLocaleDateString()
                    )
                  ) : (
                    <span>选择日期</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={2}
                  locale={zhCN}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <div className="px-6 py-2 border-b bg-muted/5 shrink-0 flex items-center justify-between">
            <TabsList className="h-9 bg-muted/50">
              <TabsTrigger value="overview" className="text-xs px-4">
                <LayoutDashboard className="w-3.5 h-3.5 mr-2" />
                概览
              </TabsTrigger>
              <TabsTrigger value="transactions" className="text-xs px-4">
                <History className="w-3.5 h-3.5 mr-2" />
                交易明细
              </TabsTrigger>
            </TabsList>

            {activeTab === 'transactions' && (
              <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground">
                <Download className="w-3.5 h-3.5 mr-2" />
                导出记录
              </Button>
            )}
          </div>

          <div className="flex-1 overflow-hidden bg-muted/5 relative">
            {/* Overview Tab */}
            <TabsContent value="overview" className="h-full m-0 overflow-y-auto p-6 space-y-6">
              {/* Balance Card Section */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Main Balance Card */}
                <div className="md:col-span-1 rounded-2xl bg-gradient-to-br from-primary to-primary/90 p-6 text-primary-foreground shadow-lg relative overflow-hidden group">
                  <div className="absolute right-0 top-0 p-6 opacity-10 group-hover:opacity-20 transition-all duration-500 scale-150">
                    <Wallet className="w-24 h-24" />
                  </div>
                  <div className="relative z-10 flex flex-col h-full justify-between">
                    <div>
                      <p className="text-primary-foreground/80 text-sm font-medium mb-1">当前余额</p>
                      {isLoading && !balance ? (
                        <Skeleton className="h-9 w-32 bg-primary-foreground/20" />
                      ) : (
                        <h2 className="text-3xl font-bold tracking-tight">{formatCurrency(balance)}</h2>
                      )}
                    </div>
                    <div className="mt-6">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-full bg-white/10 hover:bg-white/20 text-white border-0 backdrop-blur-sm shadow-none justify-between group/btn"
                      >
                        <span>立即充值</span>
                        <Plus className="w-4 h-4 ml-2 opacity-70 group-hover/btn:opacity-100" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Stats Cards */}
                <div className="md:col-span-2 grid grid-cols-2 gap-4">
                  <div className="rounded-2xl border bg-orange-50/50 dark:bg-orange-950/10 p-5 flex flex-col justify-between hover:border-orange-200/50 dark:hover:border-orange-800/50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="p-2 rounded-lg bg-orange-500/10 text-orange-600">
                        <TrendingDown className="w-5 h-5" />
                      </div>
                      <Badge variant="outline" className="text-xs font-normal text-muted-foreground bg-white/50 dark:bg-transparent">
                        本期支出
                      </Badge>
                    </div>
                    <div>
                      {isLoading ? (
                        <Skeleton className="h-8 w-24 mb-1" />
                      ) : (
                        <div className="text-2xl font-bold text-foreground">
                          {formatCurrency(summary.totalConsumption)}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        用于任务生成与分析
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border bg-emerald-50/50 dark:bg-emerald-950/10 p-5 flex flex-col justify-between hover:border-emerald-200/50 dark:hover:border-emerald-800/50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
                        <TrendingUp className="w-5 h-5" />
                      </div>
                      <Badge variant="outline" className="text-xs font-normal text-muted-foreground bg-white/50 dark:bg-transparent">
                        本期充值
                      </Badge>
                    </div>
                    <div>
                      {isLoading ? (
                        <Skeleton className="h-8 w-24 mb-1" />
                      ) : (
                        <div className="text-2xl font-bold text-foreground">
                          {formatCurrency(summary.totalRecharge)}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        账户资金充入
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Charts Section */}
              <div className="rounded-2xl border bg-card p-6 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-semibold flex items-center gap-2">
                    <LayoutDashboard className="w-4 h-4 text-muted-foreground" />
                    收支趋势
                  </h3>
                </div>

                <div className="h-[250px] w-full">
                  {isLoading ? (
                    <div className="h-full w-full flex items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.4} />
                        <XAxis
                          dataKey="date"
                          tickLine={false}
                          axisLine={false}
                          tickMargin={10}
                          fontSize={12}
                          tickFormatter={(value) => {
                            const date = new Date(value)
                            return `${date.getMonth() + 1}/${date.getDate()}`
                          }}
                          stroke="hsl(var(--muted-foreground))"
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tickMargin={10}
                          fontSize={12}
                          tickFormatter={(value) => `¥${value}`}
                          stroke="hsl(var(--muted-foreground))"
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--popover))',
                            borderColor: 'hsl(var(--border))',
                            borderRadius: '8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                          }}
                          itemStyle={{ fontSize: '12px' }}
                          labelStyle={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', marginBottom: '4px' }}
                          labelFormatter={(value) => new Date(value).toLocaleDateString()}
                        />
                        <Line
                          name="消费"
                          type="monotone"
                          dataKey="consumption"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          dot={{ r: 3, strokeWidth: 2, fill: 'hsl(var(--background))' }}
                          activeDot={{ r: 5, strokeWidth: 2 }}
                        />
                        <Line
                          name="充值"
                          type="monotone"
                          dataKey="recharge"
                          stroke="#10b981"
                          strokeWidth={2}
                          dot={{ r: 3, strokeWidth: 2, fill: 'hsl(var(--background))' }}
                          activeDot={{ r: 5, strokeWidth: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm">
                      <p>暂无趋势数据</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Recent Transactions Preview */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">最近交易</h3>
                  <Button variant="link" className="text-xs h-auto p-0" onClick={() => setActiveTab('transactions')}>
                    查看全部
                  </Button>
                </div>
                <div className="rounded-xl border bg-card overflow-hidden">
                  {isLoading ? (
                    <div className="p-4 space-y-3">
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                    </div>
                  ) : transactions.slice(0, 3).length > 0 ? (
                    <div className="divide-y">
                      {transactions.slice(0, 3).map((tx) => (
                        <TransactionRow key={tx.id} transaction={tx} />
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-muted-foreground text-sm">
                      暂无交易记录
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* Transactions Tab */}
            <TabsContent value="transactions" className="h-full m-0 flex flex-col">
              <div className="flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="p-6">
                    <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
                      {isLoading ? (
                        <div className="p-6 space-y-4">
                          {[...Array(8)].map((_, i) => (
                            <Skeleton key={i} className="h-16 w-full" />
                          ))}
                        </div>
                      ) : transactions.length > 0 ? (
                        <div className="divide-y">
                          {transactions.map((tx) => (
                            <TransactionRow key={tx.id} transaction={tx} detailed />
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                            <History className="w-8 h-8 opacity-20" />
                          </div>
                          <p>暂无交易记录</p>
                        </div>
                      )}
                    </div>
                  </div>
                </ScrollArea>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function TransactionRow({ transaction: tx, detailed = false }: { transaction: Transaction, detailed?: boolean }) {
  const categoryInfo = getCategoryInfo(tx.category)
  const Icon = categoryInfo.icon

  return (
    <div className="p-4 flex items-center justify-between hover:bg-muted/5 transition-colors group">
      <div className="flex items-center gap-4">
        <div
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-transform group-hover:scale-105',
            categoryInfo.bg,
            categoryInfo.color
          )}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{categoryInfo.label}</span>
            {tx.taskId && (
              <Badge variant="secondary" className="text-[10px] px-1.5 h-5 font-mono bg-muted text-muted-foreground">
                TASK-{tx.taskId}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground">
              {new Date(tx.createdAt).toLocaleString()}
            </span>
            {detailed && tx.metadata?.description && (
              <>
                <span className="text-[10px] text-muted-foreground/50">•</span>
                <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                  {tx.metadata.description}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div
          className={cn(
            'font-semibold tabular-nums',
            categoryInfo.color.includes('orange') || categoryInfo.color.includes('blue')
              ? 'text-foreground'
              : 'text-emerald-600'
          )}
        >
          {categoryInfo.color.includes('orange') || categoryInfo.color.includes('blue') ? '-' : '+'}
          {formatCurrency(tx.amount)}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          余额 {formatCurrency(tx.balanceAfter)}
        </div>
      </div>
    </div>
  )
}
