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
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts'
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

/** ===== 动画配置 ===== */

const ANIMATION_CONFIG = {
  duration: {
    fast: 0.2,
    normal: 0.3,
    slow: 0.4,
  },
  delay: {
    small: 0.05,
    medium: 0.1,
    large: 0.15,
    xLarge: 0.2,
  },
  easing: {
    smooth: 'easeOut',
    bounce: [0.68, -0.55, 0.265, 1.55],
  },
  spring: {
    stiffness: 300,
    damping: 30,
  },
  stagger: {
    listItem: 0.05,
  },
} as const

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
      transition={{
        duration: ANIMATION_CONFIG.duration.slow,
        ease: ANIMATION_CONFIG.easing.smooth
      }}
      className="md:col-span-1 rounded-2xl bg-[#1A1F2E] p-6 text-white shadow-xl relative overflow-hidden group flex flex-col justify-between h-[180px]"
    >
      <div className="absolute right-[-20px] top-[-20px] opacity-[0.03] group-hover:opacity-[0.06] transition-all duration-500 rotate-12">
        <Wallet className="w-48 h-48" />
      </div>

      <div className="relative z-10 flex flex-col justify-center h-full gap-6">
        <div>
          <p className="text-gray-400 text-xs font-medium mb-2 uppercase tracking-wider">当前余额</p>
          <AnimatePresence mode="wait">
            {isLoading && !balance ? (
              <Skeleton className="h-10 w-32 bg-white/10" />
            ) : (
              <motion.h2
                key={balance}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{
                  duration: ANIMATION_CONFIG.duration.normal,
                  ease: ANIMATION_CONFIG.easing.smooth
                }}
                className="text-4xl font-bold tracking-tight text-white"
              >
                {formatCurrency(balance)}
              </motion.h2>
            )}
          </AnimatePresence>
        </div>

        <div>
          <RechargeMethods configs={paymentConfigs} onSelect={onSelectPayment} />
        </div>
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
  isLoading,
  delay = 0
}: {
  title: string
  amount: number
  description?: string
  icon: React.ElementType
  iconColor: string
  borderColor?: string
  isLoading: boolean
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: ANIMATION_CONFIG.duration.slow,
        delay,
        ease: ANIMATION_CONFIG.easing.smooth
      }}
      className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-all duration-300 hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{title}</span>
          <AnimatePresence mode="wait">
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <motion.div
                key={amount}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{
                  duration: ANIMATION_CONFIG.duration.normal,
                  ease: ANIMATION_CONFIG.easing.smooth
                }}
                className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
              >
                {formatCurrency(amount)}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className={cn('rounded-lg p-2 transition-colors duration-300 group-hover:bg-zinc-100 dark:group-hover:bg-zinc-800', iconColor.replace('text-', 'text-zinc-400 group-hover:text-'))}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      {description && (
        <div className="mt-4">
          <p className="text-xs text-zinc-400 dark:text-zinc-500">{description}</p>
        </div>
      )}
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
      transition={{
        duration: ANIMATION_CONFIG.duration.slow,
        delay: ANIMATION_CONFIG.delay.xLarge,
        ease: ANIMATION_CONFIG.easing.smooth
      }}
      className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="mb-8 flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            收支趋势
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            近30天消费与充值记录
          </p>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-6 text-xs font-medium">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-zinc-900 dark:bg-zinc-100" />
            <span className="text-zinc-600 dark:text-zinc-400">消费</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-zinc-300 dark:bg-zinc-700" />
            <span className="text-zinc-600 dark:text-zinc-400">充值</span>
          </div>
        </div>
      </div>

      <div className="h-[300px] w-full">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: ANIMATION_CONFIG.duration.fast }}
              className="h-full w-full space-y-3"
            >
              {/* 图表骨架屏 */}
              <div className="flex items-end justify-between h-[250px] gap-2">
                {[65, 45, 80, 55, 90, 70, 60, 85, 50, 75].map((height, i) => (
                  <Skeleton
                    key={i}
                    className="flex-1 rounded-t"
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
              {/* X轴骨架 */}
              <div className="flex justify-between">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-3 w-12" />
                ))}
              </div>
            </motion.div>
          ) : chartData.length > 0 ? (
            <motion.div
              key="chart"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: ANIMATION_CONFIG.duration.normal,
                ease: ANIMATION_CONFIG.easing.smooth
              }}
              className="h-full w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorConsumption" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="currentColor" className="text-zinc-900 dark:text-zinc-100" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="currentColor" className="text-zinc-900 dark:text-zinc-100" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorRecharge" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="currentColor" className="text-zinc-300 dark:text-zinc-700" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="currentColor" className="text-zinc-300 dark:text-zinc-700" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="4 4"
                    vertical={false}
                    stroke="currentColor"
                    className="text-zinc-100 dark:text-zinc-800/50"
                  />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={15}
                    fontSize={11}
                    tickFormatter={(value) => {
                      const date = new Date(value)
                      return `${date.getMonth() + 1}/${date.getDate()}`
                    }}
                    stroke="currentColor"
                    className="text-zinc-400 font-medium"
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={15}
                    fontSize={11}
                    tickFormatter={(value) => `¥${value}`}
                    stroke="currentColor"
                    className="text-zinc-400 font-medium"
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      borderColor: 'rgba(228, 228, 231, 0.8)',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px -2px rgba(0, 0, 0, 0.05)',
                      padding: '8px 12px',
                      backdropFilter: 'blur(8px)',
                    }}
                    itemStyle={{ fontSize: '12px', fontWeight: 600 }}
                    labelStyle={{ fontSize: '11px', color: '#71717a', marginBottom: '4px', fontWeight: 500 }}
                    labelFormatter={(value) => new Date(value).toLocaleDateString()}
                    cursor={{ stroke: '#a1a1aa', strokeWidth: 1, strokeDasharray: '4 4' }}
                  />
                  <Area
                    name="消费"
                    type="monotone"
                    dataKey="consumption"
                    stroke="currentColor"
                    className="text-zinc-900 dark:text-zinc-100"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorConsumption)"
                    activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff', className: 'fill-zinc-900 dark:fill-zinc-100' }}
                  />
                  <Area
                    name="充值"
                    type="monotone"
                    dataKey="recharge"
                    stroke="currentColor"
                    className="text-zinc-300 dark:text-zinc-600"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorRecharge)"
                    activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff', className: 'fill-zinc-300 dark:fill-zinc-600' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-full flex-col items-center justify-center text-sm text-zinc-400"
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
function TransactionRow({
  transaction: tx,
  detailed = false,
  index = 0
}: {
  transaction: Transaction
  detailed?: boolean
  index?: number
}) {
  const categoryInfo = getCategoryInfo(tx.category)
  const Icon = categoryInfo.icon
  const isNegative = categoryInfo.color.includes('orange') || categoryInfo.color.includes('blue')

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{
        duration: ANIMATION_CONFIG.duration.normal,
        delay: index * ANIMATION_CONFIG.stagger.listItem,
        ease: ANIMATION_CONFIG.easing.smooth
      }}
      className="group flex items-center justify-between p-4 transition-all hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
    >
      <div className="flex items-center gap-4">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-100 bg-white text-zinc-500 shadow-sm transition-colors group-hover:border-zinc-200 group-hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:group-hover:text-zinc-100',
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{categoryInfo.label}</span>
            {tx.taskId && (
              <span className="rounded-[4px] bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                TASK-{tx.taskId}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              {new Date(tx.createdAt).toLocaleString()}
            </span>
            {detailed && tx.metadata?.description && (
              <>
                <span className="text-[10px] text-zinc-300 dark:text-zinc-700">•</span>
                <span className="max-w-[200px] truncate text-xs text-zinc-500 dark:text-zinc-400">
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
            'font-medium tabular-nums',
            isNegative ? 'text-zinc-900 dark:text-zinc-100' : 'text-emerald-600 dark:text-emerald-500'
          )}
        >
          {isNegative ? '-' : '+'}
          {formatCurrency(tx.amount)}
        </div>
        <div className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
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
      <DialogContent className="flex h-[85vh] flex-col gap-0 overflow-hidden border-zinc-200 bg-zinc-50/95 p-0 shadow-2xl backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/95 sm:max-w-[900px]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <DialogTitle className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">费用中心</DialogTitle>
          </div>
          <div className="mr-8 flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-9 border-zinc-200 bg-white text-xs font-normal text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800',
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
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Tab Header with Animated Background */}
          <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-6 py-2 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="relative grid h-9 w-[280px] grid-cols-2 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
              {/* Animated Tab Background */}
              <motion.div
                className="absolute inset-1 rounded-md border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-700"
                initial={false}
                animate={{
                  x: activeTab === 'overview' ? '0%' : '100%',
                }}
                transition={{
                  type: 'spring',
                  stiffness: ANIMATION_CONFIG.spring.stiffness,
                  damping: ANIMATION_CONFIG.spring.damping,
                }}
                style={{
                  width: 'calc(50% - 4px)',
                }}
              />

              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className={cn(
                  'relative z-10 flex items-center justify-center gap-2 rounded-md text-xs font-medium transition-colors duration-300',
                  activeTab === 'overview' ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                )}
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
                概览
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('transactions')}
                className={cn(
                  'relative z-10 flex items-center justify-center gap-2 rounded-md text-xs font-medium transition-colors duration-300',
                  activeTab === 'transactions' ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                )}
              >
                <History className="h-3.5 w-3.5" />
                交易明细
              </button>
            </div>

            <AnimatePresence mode="wait">
              {activeTab === 'transactions' && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{
                    duration: ANIMATION_CONFIG.duration.fast,
                    ease: ANIMATION_CONFIG.easing.smooth
                  }}
                >
                  <Button variant="ghost" size="sm" className="h-8 text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                    <Download className="mr-2 h-3.5 w-3.5" />
                    导出记录
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Tab Content with Animation */}
          <div className="relative flex-1 overflow-hidden bg-zinc-50/50 dark:bg-zinc-950/50">
            <AnimatePresence mode="wait">
              {activeTab === 'overview' ? (
                <motion.div
                  key="overview"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{
                    duration: ANIMATION_CONFIG.duration.normal,
                    ease: ANIMATION_CONFIG.easing.smooth
                  }}
                  className="absolute inset-0 h-full overflow-y-auto p-6 space-y-6"
                >
                  {/* Balance and Stats Cards */}
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                    <BalanceCard
                      balance={balance}
                      isLoading={isLoading}
                      paymentConfigs={paymentConfigs}
                      onSelectPayment={handleSelectPayment}
                    />

                    <StatCard
                      title="本期支出"
                      amount={summary.totalConsumption}
                      icon={TrendingDown}
                      iconColor="text-orange-500"
                      isLoading={isLoading}
                      delay={0.1}
                    />
                    <StatCard
                      title="本期充值"
                      amount={summary.totalRecharge}
                      icon={TrendingUp}
                      iconColor="text-emerald-500"
                      isLoading={isLoading}
                      delay={0.15}
                    />
                  </div>

                  {/* Trend Chart */}
                  <TrendChart chartData={chartData} isLoading={isLoading} />

                  {/* Recent Transactions */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: ANIMATION_CONFIG.duration.slow,
                      delay: ANIMATION_CONFIG.delay.large + ANIMATION_CONFIG.delay.large,
                      ease: ANIMATION_CONFIG.easing.smooth
                    }}
                    className="space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">最近交易</h3>
                      <Button
                        variant="link"
                        className="h-auto p-0 text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                        onClick={() => setActiveTab('transactions')}
                      >
                        查看全部
                      </Button>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                      <AnimatePresence mode="wait">
                        {isLoading ? (
                          <div className="space-y-3 p-4">
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-12 w-full" />
                          </div>
                        ) : transactions.slice(0, 3).length > 0 ? (
                          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {transactions.slice(0, 3).map((tx, index) => (
                              <TransactionRow key={tx.id} transaction={tx} index={index} />
                            ))}
                          </div>
                        ) : (
                          <div className="p-8 text-center text-sm text-zinc-500">
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
                  transition={{
                    duration: ANIMATION_CONFIG.duration.normal,
                    ease: ANIMATION_CONFIG.easing.smooth
                  }}
                  className="absolute inset-0 flex h-full flex-col"
                >
                  <div className="flex-1 overflow-hidden">
                    <ScrollArea className="h-full">
                      <div className="p-6">
                        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                          <AnimatePresence mode="wait">
                            {isLoading ? (
                              <div className="space-y-4 p-6">
                                {[...Array(8)].map((_, i) => (
                                  <Skeleton key={i} className="h-16 w-full" />
                                ))}
                              </div>
                            ) : transactions.length > 0 ? (
                              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                {transactions.map((tx, index) => (
                                  <TransactionRow key={tx.id} transaction={tx} detailed index={index} />
                                ))}
                              </div>
                            ) : (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                                animate={{
                                  opacity: 1,
                                  scale: 1,
                                  y: 0
                                }}
                                transition={{
                                  duration: ANIMATION_CONFIG.duration.slow,
                                  ease: ANIMATION_CONFIG.easing.smooth
                                }}
                                className="flex flex-col items-center justify-center py-16 text-zinc-500"
                              >
                                <motion.div
                                  animate={{
                                    rotate: [0, 5, -5, 0],
                                    scale: [1, 1.05, 1]
                                  }}
                                  transition={{
                                    repeat: Infinity,
                                    duration: 3,
                                    ease: "easeInOut"
                                  }}
                                  className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800"
                                >
                                  <History className="h-8 w-8 opacity-20" />
                                </motion.div>
                                <motion.p
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  transition={{ delay: 0.2 }}
                                >
                                  暂无交易记录
                                </motion.p>
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
