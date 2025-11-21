import { AppSidebar } from "@/components/app-sidebar"
import { ModalProvider } from "@/components/providers/modal-provider"
import { SidebarInset,SidebarProvider } from "@/components/ui/sidebar"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ModalProvider>
        <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="h-screen overflow-hidden flex flex-col">
            <div className="flex-1 overflow-y-auto">
                {children}
            </div>
        </SidebarInset>
        </SidebarProvider>
    </ModalProvider>
  )
}
