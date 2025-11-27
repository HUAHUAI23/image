'use client'

import { type PaymentConfigPublic } from '@/app/actions/payment-configs'
import {
  AvatarGroup,
  AvatarGroupTooltip,
} from '@/components/animate-ui/components/animate/avatar-group'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

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

// 主题颜色映射
const THEME_COLORS: Record<string, { bg: string; ring: string; glow: string }> = {
  wechat: {
    bg: 'bg-[#09BB07]/10 hover:bg-[#09BB07]/20',
    ring: 'ring-[#09BB07]/30',
    glow: 'shadow-[0_0_30px_-5px_rgba(9,187,7,0.3)]',
  },
  alipay: {
    bg: 'bg-[#1677FF]/10 hover:bg-[#1677FF]/20',
    ring: 'ring-[#1677FF]/30',
    glow: 'shadow-[0_0_30px_-5px_rgba(22,119,255,0.3)]',
  },
  stripe: {
    bg: 'bg-[#635BFF]/10 hover:bg-[#635BFF]/20',
    ring: 'ring-[#635BFF]/30',
    glow: 'shadow-[0_0_30px_-5px_rgba(99,91,255,0.3)]',
  },
}

export function RechargeMethods({ configs, onSelect }: RechargeMethodsProps) {
  if (!configs.length) return null

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      {/* 标题分割线 */}
      <div className="flex items-center gap-4 w-full px-4">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent opacity-50" />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em]">
          立即充值
        </span>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent opacity-50" />
      </div>

      {/* AvatarGroup 容器 */}
      <div className="mx-auto flex items-center justify-center rounded-3xl bg-white/5 px-6 py-4 backdrop-blur-2xl border border-white/10 shadow-2xl">
        <AvatarGroup className="gap-5" invertOverlap={false}>
          {configs.map((config) => {
            const colors = THEME_COLORS[config.provider] || {
              bg: 'bg-muted/30 hover:bg-muted/50',
              ring: 'ring-border',
              glow: 'shadow-[0_0_30px_-5px_rgba(0,0,0,0.1)]',
            }
            const icon = config.icon || DEFAULT_ICONS[config.provider]
            const isUrlIcon = icon?.startsWith('http://') || icon?.startsWith('https://')

            return (
              <Avatar
                key={config.provider}
                className={cn(
                  "size-16 cursor-pointer transition-all duration-300 hover:scale-110 border-2 border-white/10",
                  colors.bg
                )}
                onClick={() => onSelect(config.provider as any, config)}
              >
                {isUrlIcon ? (
                  <AvatarImage
                    src={icon}
                    alt={config.displayName}
                    className="p-2 object-contain"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <span className="text-2xl filter drop-shadow-md">{icon}</span>
                  </div>
                )}
                <AvatarFallback className="bg-transparent">
                  {config.displayName.slice(0, 2)}
                </AvatarFallback>
                <AvatarGroupTooltip className="bg-foreground text-background font-medium">
                  使用 {config.displayName} 充值
                </AvatarGroupTooltip>
              </Avatar>
            )
          })}
        </AvatarGroup>
      </div>
    </div>
  )
}
