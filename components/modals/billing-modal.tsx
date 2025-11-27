'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { type DateRange } from 'react-day-picker'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Calendar as CalendarIcon,
  Download,
  History,
  LayoutDashboard,
  Loader2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'

import {
  type AnalysisDataPoint,
  type BillingSummary,
  getBalanceAction,
  getBillingSummaryAction,
  getConsumptionAnalysisAction,
  getRechargeAnalysisAction,
  getTransactionsAction,
} from '@/app/actions/billing'
import { getEnabledPaymentConfigs, type PaymentConfigPublic } from '@/app/actions/payment-configs'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/animate-ui/components/radix/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { fenToYuan, formatCurrency } from '@/lib/const'
import { cn } from '@/lib/utils'

import { AlipayModal } from './alipay-modal'
import { RechargeMethods } from './recharge-methods'
import { WeChatPayModal } from './wechat-pay-modal'

/** ===== 类型定义 ===== */

interface Transaction {
  id: number
  category: 'task_charge' | 'task_refund' | 'analysis_charge' | 'recharge'
  amount: number
  balanceAfter: number
  taskId: number | null
  paymentMethod?: string
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

interface BillingData {
  balance: number
  summary: BillingSummary
  transactions: Transaction[]
  consumptionData: AnalysisDataPoint[]
  rechargeData: AnalysisDataPoint[]
  isLoading: boolean
}

interface CategoryInfo {
  label: string
  icon: React.ElementType
  color: string
  bg: string
}

/** ===== 工具函数 ===== */

function getCategoryInfo(category: Transaction['category']): CategoryInfo {
  const categoryMap: Record<Transaction['category'], CategoryInfo> = {
    task_charge: {
      label: '任务消费',
      icon: ArrowDownLeft,
      color: 'text-orange-500',
      bg: 'bg-orange-500/10'
    },
    task_refund: {
      label: '任务退款',
      icon: ArrowUpRight,
      color: 'text-green-500',
      bg: 'bg-green-500/10'
    },
    analysis_charge: {
      label: '分析费用',
      icon: ArrowDownLeft,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10'
    },
    recharge: {
      label: '账户充值',
      icon: ArrowUpRight,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10'
    },
  }

  return categoryMap[category]
}



/** ===== 子组件 ===== */

// 余额卡片组件
function BalanceCard({
  balance,
  isLoading,
  paymentConfigs,
  onSelectPayment
}: {
  balance: number
  isLoading: boolean
  paymentConfigs: PaymentConfigPublic[]
  onSelectPayment: (provider: 'wechat' | 'alipay' | 'stripe', config: PaymentConfigPublic) => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="md:col-span-1 rounded-2xl bg-gradient-to-br from-primary to-primary/90 p-6 text-primary-foreground shadow-lg relative overflow-hidden group flex flex-col justify-between"
    >
      <div className="absolute right-0 top-0 p-6 opacity-10 group-hover:opacity-20 transition-all duration-500 scale-150">
        <Wallet className="w-24 h-24" />
      </div>

      <div className="relative z-10">
        <p className="text-primary-foreground/80 text-sm font-medium mb-1">当前余额</p>
        <AnimatePresence mode="wait">
          {isLoading && !balance ? (
            <Skeleton className="h-9 w-32 bg-primary-foreground/20" />
          ) : (
            <motion.h2
              key={balance}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3 }}
              className="text-3xl font-bold tracking-tight"
            >
              {formatCurrency(balance)}
            </motion.h2>
          )}
        </AnimatePresence>
      </div>

      {/* 充值方式图标列 */}
      <div className="relative z-10 mt-6">
        <RechargeMethods configs={paymentConfigs} onSelect={onSelectPayment} />
      </div>
    </motion.div>
  )
}

// 统计卡片组件
function StatCard({
  title,
  amount,
  description,
  icon: Icon,
  iconColor,
  bgColor,
  borderColor,
  isLoading,
  delay = 0
}: {
  title: string
  amount: number
  description: string
  icon: React.ElementType
  iconColor: string
  bgColor: string
  borderColor: string
  isLoading: boolean
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className={cn(
        'rounded-2xl border p-5 flex flex-col justify-between transition-colors',
        bgColor,
        borderColor
      )}
    >
      <div className="flex items-start justify-between">
        <div className={cn('p-2 rounded-lg', iconColor)}>
          <Icon className="w-5 h-5" />
        </div>
        <Badge variant="outline" className="text-xs font-normal text-muted-foreground bg-white/50 dark:bg-transparent">
          {title}
        </Badge>
      </div>
      <div>
        <AnimatePresence mode="wait">
          {isLoading ? (
            <Skeleton className="h-8 w-24 mb-1" />
          ) : (
            <motion.div
              key={amount}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3 }}
              className="text-2xl font-bold text-foreground"
            >
              {formatCurrency(amount)}
            </motion.div>
          )}
        </AnimatePresence>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
    </motion.div>
  )
}

// 图表组件
function TrendChart({
  chartData,
  isLoading
}: {
  chartData: Array<{ date: string; consumption: number; recharge: number }>
  isLoading: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="rounded-2xl border bg-card p-6 shadow-sm"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-semibold flex items-center gap-2">
          <LayoutDashboard className="w-4 h-4 text-muted-foreground" />
          收支趋势
        </h3>
      </div>

      <div className="h-[250px] w-full">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full w-full flex items-center justify-center"
            >
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </motion.div>
          ) : chartData.length > 0 ? (
            <motion.div
              key="chart"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="h-full w-full"
            >
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
                  <RechartsTooltip
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
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm"
            >
              <p>暂无趋势数据</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// 交易行组件
function TransactionRow({ transaction: tx, detailed = false }: { transaction: Transaction; detailed?: boolean }) {
  const categoryInfo = getCategoryInfo(tx.category)
  const Icon = categoryInfo.icon
  const isNegative = categoryInfo.color.includes('orange') || categoryInfo.color.includes('blue')

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.3 }}
      className="p-4 flex items-center justify-between hover:bg-muted/5 transition-colors group"
    >
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
            isNegative ? 'text-foreground' : 'text-emerald-600'
          )}
        >
          {isNegative ? '-' : '+'}
          {formatCurrency(tx.amount)}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          余额 {formatCurrency(tx.balanceAfter)}
        </div>
      </div>
    </motion.div>
  )
}

/** ===== 主组件 ===== */

export function BillingModal({ open, onOpenChange }: BillingModalProps) {
  const [activeTab, setActiveTab] = useState('overview')
  const [wechatPayOpen, setWechatPayOpen] = useState(false)
  const [alipayOpen, setAlipayOpen] = useState(false)
  const [selectedPaymentConfig, setSelectedPaymentConfig] = useState<any>(null)
  const [paymentConfigs, setPaymentConfigs] = useState<PaymentConfigPublic[]>([])
  const [data, setData] = useState<BillingData>({
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
    start.setDate(start.getDate() - 30)
    return { from: start, to: end }
  })

  const { balance, summary, transactions, consumptionData, rechargeData, isLoading } = data

  // 数据获取
  const fetchData = useCallback(async () => {
    setData((prev) => ({ ...prev, isLoading: true }))

    try {
      const startDate = dateRange?.from?.toISOString()
      const endDate = dateRange?.to?.toISOString()

      const [bal, sum, txs, consumption, recharge, configs] = await Promise.all([
        getBalanceAction(),
        getBillingSummaryAction(startDate, endDate),
        getTransactionsAction(startDate, endDate),
        startDate && endDate ? getConsumptionAnalysisAction(startDate, endDate) : Promise.resolve([]),
        startDate && endDate ? getRechargeAnalysisAction(startDate, endDate) : Promise.resolve([]),
        getEnabledPaymentConfigs(),
      ])

      setPaymentConfigs(configs)
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
  }, [dateRange])

  useEffect(() => {
    if (!open) return
    // Fetching data when modal opens is intentional and necessary
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData()
  }, [open, fetchData])

  // 处理支付方式选择
  const handleSelectPayment = (provider: 'wechat' | 'alipay' | 'stripe', config: any) => {
    setSelectedPaymentConfig(config)

    if (provider === 'wechat') {
      setWechatPayOpen(true)
    } else if (provider === 'alipay') {
      setAlipayOpen(true)
    } else if (provider === 'stripe') {
      toast.error('Stripe 支付即将上线')
    }
  }

  // 处理充值成功
  const handleRechargeSuccess = () => {
    fetchData() // 刷新数据
  }

  // 图表数据处理
  const chartData = useMemo(() => {
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
  }, [consumptionData, rechargeData])

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
                  className={cn('h-9 text-xs font-normal', !dateRange && 'text-muted-foreground')}
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
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Tab Header with Animated Background */}
          <div className="px-6 py-2 border-b bg-muted/5 shrink-0 flex items-center justify-between">
            <div className="relative grid grid-cols-2 p-1 bg-muted/50 rounded-lg h-9 w-[280px]">
              {/* Animated Tab Background */}
              <motion.div
                className="absolute inset-1 bg-background rounded-md shadow-sm border"
                initial={false}
                animate={{
                  x: activeTab === 'overview' ? '0%' : '100%',
                }}
                transition={{
                  type: 'spring',
                  stiffness: 300,
                  damping: 30,
                }}
                style={{
                  width: 'calc(50% - 4px)',
                }}
              />

              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className={cn(
                  'relative z-10 flex items-center justify-center gap-2 text-xs font-medium rounded-md transition-colors duration-300',
                  activeTab === 'overview' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                概览
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('transactions')}
                className={cn(
                  'relative z-10 flex items-center justify-center gap-2 text-xs font-medium rounded-md transition-colors duration-300',
                  activeTab === 'transactions' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <History className="w-3.5 h-3.5" />
                交易明细
              </button>
            </div>

            <AnimatePresence mode="wait">
              {activeTab === 'transactions' && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground">
                    <Download className="w-3.5 h-3.5 mr-2" />
                    导出记录
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Tab Content with Animation */}
          <div className="flex-1 overflow-hidden bg-muted/5 relative">
            <AnimatePresence mode="wait">
              {activeTab === 'overview' ? (
                <motion.div
                  key="overview"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                  className="h-full overflow-y-auto p-6 space-y-6 absolute inset-0"
                >
                  {/* Balance and Stats Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <BalanceCard
                      balance={balance}
                      isLoading={isLoading}
                      paymentConfigs={paymentConfigs}
                      onSelectPayment={handleSelectPayment}
                    />

                    <div className="md:col-span-2 grid grid-cols-2 gap-4">
                      <StatCard
                        title="本期支出"
                        amount={summary.totalConsumption}
                        description="用于任务生成与分析"
                        icon={TrendingDown}
                        iconColor="bg-orange-500/10 text-orange-600"
                        bgColor="bg-orange-50/50 dark:bg-orange-950/10"
                        borderColor="hover:border-orange-200/50 dark:hover:border-orange-800/50"
                        isLoading={isLoading}
                        delay={0.1}
                      />
                      <StatCard
                        title="本期充值"
                        amount={summary.totalRecharge}
                        description="账户资金充入"
                        icon={TrendingUp}
                        iconColor="bg-emerald-500/10 text-emerald-600"
                        bgColor="bg-emerald-50/50 dark:bg-emerald-950/10"
                        borderColor="hover:border-emerald-200/50 dark:hover:border-emerald-800/50"
                        isLoading={isLoading}
                        delay={0.15}
                      />
                    </div>
                  </div>

                  {/* Trend Chart */}
                  <TrendChart chartData={chartData} isLoading={isLoading} />

                  {/* Recent Transactions */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.3 }}
                    className="space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-sm">最近交易</h3>
                      <Button
                        variant="link"
                        className="text-xs h-auto p-0"
                        onClick={() => setActiveTab('transactions')}
                      >
                        查看全部
                      </Button>
                    </div>
                    <div className="rounded-xl border bg-card overflow-hidden">
                      <AnimatePresence mode="wait">
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
                      </AnimatePresence>
                    </div>
                  </motion.div>
                </motion.div>
              ) : (
                <motion.div
                  key="transactions"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="h-full flex flex-col absolute inset-0"
                >
                  <div className="flex-1 overflow-hidden">
                    <ScrollArea className="h-full">
                      <div className="p-6">
                        <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
                          <AnimatePresence mode="wait">
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
                              <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="flex flex-col items-center justify-center py-16 text-muted-foreground"
                              >
                                <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                                  <History className="w-8 h-8 opacity-20" />
                                </div>
                                <p>暂无交易记录</p>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </ScrollArea>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </DialogContent>

      {/* WeChat Pay Modal */}
      <WeChatPayModal
        open={wechatPayOpen}
        onOpenChange={setWechatPayOpen}
        onSuccess={handleRechargeSuccess}
        config={selectedPaymentConfig}
      />

      {/* Alipay Modal */}
      <AlipayModal
        open={alipayOpen}
        onOpenChange={setAlipayOpen}
        onSuccess={handleRechargeSuccess}
        config={selectedPaymentConfig}
      />
    </Dialog>
  )
}
