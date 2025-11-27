'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Clock, Loader2, QrCode, X } from 'lucide-react'
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
      <DialogContent className="sm:max-w-[480px] p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold">支付宝支付</DialogTitle>
              <p className="text-xs text-muted-foreground">扫码完成充值</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <AnimatePresence mode="wait">
            {status === 'input' && (
              <motion.div
                key="input"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                {/* Preset Amounts */}
                <div>
                  <label className="text-sm font-medium mb-3 block">选择充值金额</label>
                  <div className="grid grid-cols-4 gap-3">
                    {presetAmounts.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setAmount(preset)
                          setIsCustom(false)
                        }}
                        className={cn(
                          'h-12 rounded-lg border-2 transition-all',
                          !isCustom && amount === preset
                            ? 'border-primary bg-primary/5 text-primary font-medium'
                            : 'border-border hover:border-primary/50 text-muted-foreground hover:text-foreground'
                        )}
                      >
                        ¥{preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Amount */}
                <div>
                  <label className="text-sm font-medium mb-3 block">或输入自定义金额</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      ¥
                    </span>
                    <Input
                      type="number"
                      min={minAmount}
                      max={maxAmount}
                      step="1"
                      placeholder={`${minAmount}-${maxAmount}`}
                      value={customAmount}
                      onChange={(e) => {
                        setCustomAmount(e.target.value)
                        setIsCustom(true)
                      }}
                      onFocus={() => setIsCustom(true)}
                      className="pl-8 h-12"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    充值金额范围：¥{minAmount} - ¥{maxAmount}（仅支持整数）
                  </p>
                </div>

                {/* Amount Display */}
                <div className="rounded-lg bg-muted/50 p-4 border">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-muted-foreground">实付金额</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-foreground">
                        ¥{isCustom ? customAmount || '0' : amount}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Create Order Button */}
                <Button
                  onClick={handleCreateOrder}
                  disabled={isCreating}
                  className="w-full h-12 text-base bg-blue-600 hover:bg-blue-700"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      创建订单中...
                    </>
                  ) : (
                    '确认充值'
                  )}
                </Button>
              </motion.div>
            )}

            {status === 'paying' && orderInfo && (
              <motion.div
                key="paying"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                {/* Amount */}
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-1">充值金额</p>
                  <p className="text-3xl font-bold text-foreground">¥{orderInfo.amount}</p>
                </div>

                {/* QR Code */}
                <div className="flex justify-center">
                  <div className="relative">
                    <div className="rounded-2xl border-4 border-border bg-white p-4 shadow-lg">
                      {qrCodeUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={qrCodeUrl} alt="QR Code" className="w-[280px] h-[280px]" />
                      ) : (
                        <div className="w-[280px] h-[280px] flex items-center justify-center">
                          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="absolute -top-2 -right-2">
                      <Badge className="bg-blue-600 text-white shadow-md">
                        <Clock className="w-3 h-3 mr-1" />
                        {formatCountdown(countdown)}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Instructions */}
                <div className="space-y-2 text-center">
                  <p className="text-sm font-medium">请使用支付宝扫描二维码完成支付</p>
                  <p className="text-xs text-muted-foreground">
                    订单号：{orderInfo.outTradeNo}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    请在 {formatCountdown(countdown)} 内完成支付
                  </p>
                </div>

                {/* Cancel Button */}
                <Button
                  onClick={() => {
                    setStatus('input')
                    setOrderInfo(null)
                    clearTimers()
                  }}
                  variant="outline"
                  className="w-full"
                >
                  取消支付
                </Button>
              </motion.div>
            )}

            {status === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3 }}
                className="text-center py-8 space-y-4"
              >
                <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                  <Check className="w-8 h-8 text-green-600" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">支付成功</h3>
                  <p className="text-sm text-muted-foreground">
                    充值金额已到账，余额已更新
                  </p>
                </div>
              </motion.div>
            )}

            {status === 'expired' && (
              <motion.div
                key="expired"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3 }}
                className="text-center py-8 space-y-4"
              >
                <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center mx-auto">
                  <X className="w-8 h-8 text-orange-600" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">订单已过期</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    订单超时未支付，请重新创建订单
                  </p>
                  <Button
                    onClick={() => {
                      setStatus('input')
                      setOrderInfo(null)
                      clearTimers()
                    }}
                    className="w-full"
                  >
                    重新充值
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  )
}
