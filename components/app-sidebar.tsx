'use client'

import * as React from "react"
import {
  Image as ImageIcon,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { UserDropdown } from "@/components/sidebar/user-dropdown"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="offcanvas" {...props} className="border-r border-border/50 bg-sidebar/50 backdrop-blur-xl">
      <SidebarHeader className="pb-4 pt-5 px-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="hover:bg-sidebar-accent/50 transition-colors duration-200">
              <Link href="/">
                <div className="flex aspect-square size-10 items-center justify-center rounded-xl">
                  <Image src="/icon.svg" alt="Lumina" width={32} height={32} className="size-8 rounded-lg" />
                </div>
                <div className="flex-1 text-left text-sm leading-tight ml-1">
                  <span className="truncate font-bold text-base bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                    Lumina
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="px-3 py-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1.5">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === '/' || pathname.startsWith('/task')}
                  size="lg"
                  className="w-full justify-start gap-3 px-3 py-2.5 font-medium text-muted-foreground/80 transition-all duration-200 hover:bg-sidebar-accent/50 hover:text-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-primary data-[active=true]:shadow-sm data-[active=true]:font-semibold group/menu-item"
                >
                  <Link href="/">
                    <div className="flex items-center justify-center size-6 rounded-md transition-colors group-data-[active=true]/menu-item:bg-primary/10 group-data-[active=true]/menu-item:text-primary">
                      <ImageIcon className="size-4" />
                    </div>
                    <span>任务列表</span>
                    {pathname === '/' || pathname.startsWith('/task') ? (
                      <div className="ml-auto w-1 h-1 rounded-full bg-primary" />
                    ) : null}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <UserDropdown />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
