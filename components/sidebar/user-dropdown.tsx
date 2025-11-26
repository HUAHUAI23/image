'use client'

import * as React from "react"
import {
  ChevronsUpDown,
  CreditCard,
  Crown,
  Loader2,
  LogOut
} from "lucide-react"
import Link from "next/link"

import { logoutAction } from "@/app/actions/auth"
import { getBalanceAction } from "@/app/actions/billing"
import { useModal } from "@/components/providers/modal-provider"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenuButton } from "@/components/ui/sidebar"
import { formatCurrency } from "@/lib/const"

export function UserDropdown() {
  const { setBillingOpen } = useModal()
  const [balance, setBalance] = React.useState<number | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    const fetchBalance = async () => {
      try {
        const data = await getBalanceAction()
        setBalance(data)
      } catch (error) {
        console.error("Failed to fetch balance:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchBalance()
  }, [])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground hover:bg-sidebar-accent/50 transition-all duration-200"
        >
          <Avatar className="h-8 w-8 rounded-lg ring-1 ring-border/50">
            <AvatarImage src="" alt="User" />
            <AvatarFallback className="rounded-lg bg-gradient-to-br from-indigo-100 to-purple-100 text-indigo-600 dark:from-indigo-900 dark:to-purple-900 dark:text-indigo-300 font-medium">CN</AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-semibold text-foreground/90">我的账户</span>
            <span className="truncate text-xs text-muted-foreground">user@example.com</span>
          </div>
          <ChevronsUpDown className="ml-auto size-4 text-muted-foreground/50" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-[--radix-dropdown-menu-trigger-width] min-w-60 rounded-xl border-border/50 shadow-xl bg-background/95 backdrop-blur-xl p-1"
        side="top"
        align="start"
        sideOffset={8}
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-3 px-2 py-2.5 text-left text-sm">
            <Avatar className="h-9 w-9 rounded-lg ring-1 ring-border/50">
              <AvatarImage src="" alt="User" />
              <AvatarFallback className="rounded-lg bg-gradient-to-br from-indigo-100 to-purple-100 text-indigo-600 dark:from-indigo-900 dark:to-purple-900 dark:text-indigo-300 font-medium">CN</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight gap-0.5">
              <span className="truncate font-semibold text-foreground">我的账户</span>
              <span className="truncate text-xs text-muted-foreground">user@example.com</span>
            </div>
          </div>
        </DropdownMenuLabel>

        <div className="px-2 pb-2">
          <div
            onClick={() => setBillingOpen(true)}
            className="flex items-center justify-between p-2 rounded-lg bg-muted/50 border border-border/50 cursor-pointer hover:bg-muted transition-colors group"
          >
            <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">当前余额</span>
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            ) : (
              <span className="text-sm font-bold font-mono text-primary group-hover:text-primary/80 transition-colors">
                {formatCurrency(balance || 0)}
              </span>
            )}
          </div>
        </div>

        <DropdownMenuSeparator className="bg-border/50 my-1" />

        <DropdownMenuItem onClick={() => setBillingOpen(true)} className="flex w-full items-center cursor-pointer rounded-lg px-2 py-2 focus:bg-sidebar-accent/50">
          <CreditCard className="mr-2 h-4 w-4 text-muted-foreground" />
          <span className="text-sm">账单管理</span>
        </DropdownMenuItem>

        <DropdownMenuItem asChild className="focus:bg-indigo-50 dark:focus:bg-indigo-950/30">
          <Link href="#" className="flex w-full items-center cursor-pointer rounded-lg px-2 py-2 group">
            <div className="flex items-center flex-1">
              <Crown className="mr-2 h-4 w-4 text-indigo-500 group-hover:text-indigo-600 transition-colors" />
              <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors">升级计划</span>
            </div>
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800">PRO</Badge>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-border/50 my-1" />

        <DropdownMenuItem asChild className="text-red-600 dark:text-red-400 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/20 rounded-lg px-2 py-2">
          <form action={logoutAction} className="w-full">
            <button type="submit" className="flex w-full items-center cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" />
              <span className="text-sm">退出登录</span>
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
