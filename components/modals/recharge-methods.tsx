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
    <div className="flex items-center">
      <AvatarGroup className="gap-3 space-x-0" invertOverlap={false}>
        {configs.map((config) => {
          const icon = config.icon || DEFAULT_ICONS[config.provider]
          const isUrlIcon = icon?.startsWith('http://') || icon?.startsWith('https://')

          return (
            <Avatar
              key={config.provider}
              className="h-12 w-12 cursor-pointer border-2 border-white/10 transition-transform hover:scale-110 hover:z-10 bg-[#2A2F3E]"
              onClick={() => onSelect(config.provider as any, config)}
            >
              {isUrlIcon ? (
                <AvatarImage
                  src={icon}
                  alt={config.displayName}
                  className="object-contain p-2"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted/20">
                  <span className="text-xl">{icon}</span>
                </div>
              )}
              <AvatarFallback className="bg-muted/20 text-xs">
                {config.displayName.slice(0, 2)}
              </AvatarFallback>
              <AvatarGroupTooltip>
                {config.displayName}
              </AvatarGroupTooltip>
            </Avatar>
          )
        })}
      </AvatarGroup>
    </div>
  )
}
