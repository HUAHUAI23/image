'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Clock, Loader2, Smartphone, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import QRCode from 'qrcode'
import { toast } from 'sonner'

import { Dialog, DialogContent, DialogTitle } from '@/components/animate-ui/components/radix/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface AlipayModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
  config?: {
    presetAmounts: number[]
    minAmount: number
    maxAmount: number
  }
}

interface OrderInfo {
  chargeOrderId: number
  outTradeNo: string
  qrCode: string
  amount: number
  expireTime: number // 秒
  expireAt: string
}

type PaymentStatus = 'input' | 'paying' | 'success' | 'failed' | 'expired'

const DEFAULT_PRESET_AMOUNTS = [10, 50, 100, 500]

export function AlipayModal({ open, onOpenChange, onSuccess, config }: AlipayModalProps) {
  const presetAmounts = config?.presetAmounts || DEFAULT_PRESET_AMOUNTS
  const minAmount = config?.minAmount || 1
  const maxAmount = config?.maxAmount || 100000

  const [amount, setAmount] = useState<number>(presetAmounts[0])
  const [customAmount, setCustomAmount] = useState<string>('')
  const [isCustom, setIsCustom] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(null)
  const [status, setStatus] = useState<PaymentStatus>('input')
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('')
  const [countdown, setCountdown] = useState(0)
  const pollingIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const countdownIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined)

  // 清理定时器
  const clearTimers = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = undefined
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current)
      countdownIntervalRef.current = undefined
    }
  }, [])

  // 重置状态
  const resetState = useCallback(() => {
    clearTimers()
    setAmount(presetAmounts[0])
    setCustomAmount('')
    setIsCustom(false)
    setOrderInfo(null)
    setStatus('input')
    setQrCodeUrl('')
    setCountdown(0)
  }, [clearTimers, presetAmounts])

  // 关闭弹窗时清理
  useEffect(() => {
    if (!open) {
      resetState()
    }
  }, [open, resetState])

  // 生成二维码
  useEffect(() => {
    if (orderInfo?.qrCode) {
      QRCode.toDataURL(orderInfo.qrCode, {
        width: 280,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      })
        .then(setQrCodeUrl)
        .catch((err) => {
          console.error('Failed to generate QR code:', err)
          toast.error('二维码生成失败')
        })
    }
  }, [orderInfo?.qrCode])

  // 倒计时
  useEffect(() => {
    if (orderInfo && status === 'paying') {
      const expireAt = new Date(orderInfo.expireAt).getTime()
      const updateCountdown = () => {
        const now = Date.now()
        const remaining = Math.max(0, Math.floor((expireAt - now) / 1000))
        setCountdown(remaining)

        if (remaining === 0) {
          clearTimers()
          setStatus('expired')
          toast.error('订单已超时，请重新创建')
        }
      }

      updateCountdown()
      countdownIntervalRef.current = setInterval(updateCountdown, 1000)

      return () => {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current)
        }
      }
    }
  }, [orderInfo, status, clearTimers])

  // 轮询查询订单状态
  useEffect(() => {
    if (orderInfo && status === 'paying') {
      const pollOrder = async () => {
        try {
          const response = await fetch(
            `/api/alipay/query-order?outTradeNo=${orderInfo.outTradeNo}`
          )
          const result = await response.json()

          if (result.success && result.data.status === 'success') {
            clearTimers()
            setStatus('success')
            toast.success('支付成功！')
            setTimeout(() => {
              onSuccess?.()
              onOpenChange(false)
            }, 2000)
          }
        } catch (error) {
          console.error('Failed to query order:', error)
        }
      }

      // 首次立即查询
      pollOrder()

      // 每5秒轮询一次
      pollingIntervalRef.current = setInterval(pollOrder, 5000)

      return () => {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
        }
      }
    }
  }, [orderInfo, status, onSuccess, onOpenChange, clearTimers])

  // 创建订单
  const handleCreateOrder = async () => {
    const finalAmount = isCustom ? parseFloat(customAmount) : amount

    if (!finalAmount || finalAmount < minAmount || finalAmount > maxAmount) {
      toast.error(`请输入有效的充值金额 (${minAmount}-${maxAmount}元)`)
      return
    }

    setIsCreating(true)

    try {
      const response = await fetch('/api/alipay/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount: finalAmount }),
      })

      const result = await response.json()

      if (!response.ok) {
        toast.error(result.error || '创建订单失败')
        return
      }

      if (result.success && result.data) {
        setOrderInfo(result.data)
        setStatus('paying')
        toast.success('订单创建成功，请扫码支付')
      } else {
        toast.error('创建订单失败')
      }
    } catch (error) {
      console.error('Failed to create order:', error)
      toast.error('创建订单失败，请稍后重试')
    } finally {
      setIsCreating(false)
    }
  }

  // 格式化倒计时
  const formatCountdown = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-0 gap-0 overflow-hidden border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        {/* Header Background Pattern */}
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-blue-50/50 to-transparent dark:from-blue-950/20 pointer-events-none" />

        {/* Header */}
        <div className="relative flex items-center justify-between px-6 py-5 border-b border-zinc-100 dark:border-zinc-800/50">
          <DialogTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-100">支付宝支付</DialogTitle>
        </div>

        {/* Content */}
        <div className="p-6 relative">
          <AnimatePresence mode="wait">
            {status === 'input' && (
              <motion.div
                key="input"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                {/* Preset Amounts */}
                <div>
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-3 block px-1">选择充值金额</label>
                  <div className="grid grid-cols-2 gap-3">
                    {presetAmounts.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setAmount(preset)
                          setIsCustom(false)
                        }}
                        className={cn(
                          'relative h-14 rounded-xl border transition-all duration-200 flex items-center px-4 group',
                          !isCustom && amount === preset
                            ? 'border-zinc-900 bg-zinc-900 text-white shadow-md dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                            : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/50'
                        )}
                      >
                        <span className={cn(
                          "text-lg font-semibold transition-colors",
                          !isCustom && amount === preset
                            ? 'text-white dark:text-zinc-900'
                            : 'text-zinc-900 dark:text-zinc-100'
                        )}>
                          ¥{preset}
                        </span>
                        {(!isCustom && amount === preset) && (
                          <motion.div
                            layoutId="check"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white dark:text-zinc-900"
                          >
                            <Check className="w-4 h-4" />
                          </motion.div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Amount */}
                <div>
                  <div className="relative">
                    <div className={cn(
                      "absolute inset-0 rounded-xl transition-all duration-200 pointer-events-none",
                      isCustom ? "ring-2 ring-zinc-900 ring-opacity-10 dark:ring-zinc-100" : ""
                    )} />
                    <div className="relative flex items-center">
                      <span className="absolute left-4 text-zinc-400 font-medium">¥</span>
                      <Input
                        type="number"
                        min={minAmount}
                        max={maxAmount}
                        step="1"
                        placeholder="输入自定义金额"
                        value={customAmount}
                        onChange={(e) => {
                          setCustomAmount(e.target.value)
                          setIsCustom(true)
                        }}
                        onFocus={() => setIsCustom(true)}
                        className={cn(
                          "pl-8 h-12 rounded-xl border-zinc-200 bg-zinc-50/50 text-base transition-all focus-visible:ring-0 focus-visible:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/50 dark:focus-visible:border-zinc-100",
                          isCustom && "border-zinc-900 bg-white dark:border-zinc-100 dark:bg-zinc-900"
                        )}
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between px-1">
                    <p className="text-[10px] text-zinc-400">
                      范围：¥{minAmount} - ¥{maxAmount}
                    </p>
                    {isCustom && customAmount && (
                      <span className="text-[10px] text-zinc-900 dark:text-zinc-100 font-medium">
                        确认金额
                      </span>
                    )}
                  </div>
                </div>

                {/* Create Order Button */}
                <Button
                  onClick={handleCreateOrder}
                  disabled={isCreating || (isCustom && !customAmount)}
                  className="w-full h-12 rounded-xl text-base font-medium bg-zinc-900 hover:bg-zinc-800 text-white shadow-lg shadow-zinc-900/10 transition-all active:scale-[0.98] dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      正在创建订单...
                    </>
                  ) : (
                    <>
                      <span className="mr-1">支付</span>
                      <span className="font-bold">¥{isCustom ? customAmount || '0' : amount}</span>
                    </>
                  )}
                </Button>
              </motion.div>
            )}

            {status === 'paying' && orderInfo && (
              <motion.div
                key="paying"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center"
              >
                {/* Amount Display */}
                <div className="text-center mb-8">
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 uppercase tracking-wider">支付金额</p>
                  <div className="flex items-baseline justify-center gap-1 text-zinc-900 dark:text-zinc-100">
                    <span className="text-2xl font-bold">¥</span>
                    <span className="text-4xl font-bold tracking-tight">{orderInfo.amount}</span>
                  </div>
                </div>

                {/* QR Code Container */}
                <div className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-tr from-zinc-200 to-zinc-100 rounded-[20px] opacity-50 blur group-hover:opacity-70 transition-opacity duration-500 dark:from-zinc-800 dark:to-zinc-900" />
                  <div className="relative rounded-2xl border border-zinc-100 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
                    {qrCodeUrl ? (
                      <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={qrCodeUrl} alt="QR Code" className="w-[200px] h-[200px] rounded-lg" />

                        {/* Scanning Animation */}
                        <motion.div
                          initial={{ top: 0 }}
                          animate={{ top: "100%" }}
                          transition={{
                            duration: 2,
                            repeat: Infinity,
                            ease: "linear",
                            repeatType: "loop"
                          }}
                          className="absolute left-0 w-full h-[1px] bg-zinc-900 shadow-[0_0_8px_rgba(0,0,0,0.2)] dark:bg-zinc-100 dark:shadow-[0_0_8px_rgba(255,255,255,0.2)]"
                        />
                      </div>
                    ) : (
                      <div className="w-[200px] h-[200px] flex items-center justify-center bg-zinc-50 dark:bg-zinc-900 rounded-lg">
                        <Loader2 className="w-8 h-8 animate-spin text-zinc-300" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Status & Timer */}
                <div className="mt-8 w-full space-y-4">
                  <div className="flex items-center justify-center gap-2 text-sm font-medium text-zinc-600 dark:text-zinc-300">
                    <Smartphone className="w-4 h-4" />
                    <span>打开支付宝 [扫一扫]</span>
                  </div>

                  <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-50 border border-zinc-100 dark:bg-zinc-900/50 dark:border-zinc-800/50">
                    <span className="text-xs text-zinc-500">支付剩余时间</span>
                    <Badge variant="secondary" className={cn(
                      "font-mono transition-colors",
                      countdown < 60 ? "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400" : "bg-white text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                    )}>
                      <Clock className="w-3 h-3 mr-1.5" />
                      {formatCountdown(countdown)}
                    </Badge>
                  </div>
                </div>

                {/* Cancel Button */}
                <button
                  onClick={() => {
                    setStatus('input')
                    setOrderInfo(null)
                    clearTimers()
                  }}
                  className="mt-6 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                >
                  取消支付并返回
                </button>
              </motion.div>
            )}

            {status === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center py-8"
              >
                <div className="relative mb-6">
                  <div className="absolute inset-0 bg-zinc-200 blur-xl rounded-full dark:bg-zinc-800" />
                  <div className="relative w-20 h-20 rounded-full bg-zinc-900 flex items-center justify-center shadow-lg dark:bg-zinc-100">
                    <Check className="w-10 h-10 text-white dark:text-zinc-900" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">支付成功</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center max-w-[200px]">
                  充值金额已到账，正在跳转...
                </p>
              </motion.div>
            )}

            {status === 'expired' && (
              <motion.div
                key="expired"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center py-8"
              >
                <div className="w-20 h-20 rounded-full bg-zinc-100 flex items-center justify-center mb-6 dark:bg-zinc-800">
                  <X className="w-10 h-10 text-zinc-400" />
                </div>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">订单已过期</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center mb-8">
                  支付时间已耗尽，请重新创建订单
                </p>
                <Button
                  onClick={() => {
                    setStatus('input')
                    setOrderInfo(null)
                    clearTimers()
                  }}
                  className="w-full h-11 rounded-xl"
                >
                  重新充值
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  )
}
