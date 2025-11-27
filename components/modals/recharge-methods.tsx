'use client'

import { type PaymentConfigPublic } from '@/app/actions/payment-configs'


interface RechargeMethodsProps {
  configs: PaymentConfigPublic[]
  onSelect: (provider: 'wechat' | 'alipay' | 'stripe', config: PaymentConfigPublic) => void
}

// 默认图标映射
const DEFAULT_ICONS: Record<string, string> = {
  wechat: '💚',
  alipay: '💙',
  stripe: '💳',
}

export function RechargeMethods({ configs, onSelect }: RechargeMethodsProps) {
  if (!configs.length) return null

  return (
    <div className="grid gap-1 min-w-[240px] p-1">
      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground mb-1">
        选择充值方式
      </div>
      {configs.map((config) => {
        const icon = config.icon || DEFAULT_ICONS[config.provider]
        const isUrlIcon = icon?.startsWith('http://') || icon?.startsWith('https://')

        return (
          <button
            key={config.provider}
            onClick={() => onSelect(config.provider as any, config)}
            className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-accent transition-all duration-200 border border-transparent hover:border-border"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted/50 border shadow-sm group-hover:bg-background transition-colors">
              {isUrlIcon ? (
                <img
                  src={icon}
                  alt={config.displayName}
                  className="h-5 w-5 object-contain"
                />
              ) : (
                <span className="text-lg">{icon}</span>
              )}
            </div>
            <div className="flex-1 text-left">
              <div className="text-foreground">{config.displayName}</div>
              <div className="text-[10px] text-muted-foreground font-normal">
                支持自动到账
              </div>
            </div>
            <div className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground">
              →
            </div>
          </button>
        )
      })}
    </div>
  )
}
