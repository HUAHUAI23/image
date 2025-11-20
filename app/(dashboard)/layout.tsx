import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { ModalProvider } from "@/components/providers/modal-provider"

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
            <div className="flex-1 overflow-y-auto p-4 md:p-8">
                <div className="max-w-7xl mx-auto w-full flex flex-col gap-4">
                    <div className="flex items-center gap-2 mb-4 md:hidden">
                        <SidebarTrigger />
                    </div>
                    {children}
                </div>
            </div>
        </SidebarInset>
        </SidebarProvider>
    </ModalProvider>
  )
}
