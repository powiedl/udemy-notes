import { AppSidebar } from '#/components/app-sidebar'
import Footer from '#/components/Footer'
import { SidebarInset, SidebarProvider } from '#/components/ui/sidebar'
import { getSessionFn } from '#/data/session'
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_content')({
  component: RouteComponent,
  loader: async () => {
    const session = await getSessionFn()
    return {
      user: session.user,
    }
  },
})

function RouteComponent() {
  const { user } = Route.useLoaderData()

  return (
    <>
      <SidebarProvider className="h-full">
        <AppSidebar user={user} />
        <SidebarInset className="flex flex-col w-full h-full overflow-hidden bg-transparent">
          <div className="flex-1 overflow-y-auto flex flex-col *:mx-auto mt-4">
            <div className="main-content flex-1 w-full max-w-6xl mx-auto px-8 -py-8">
              <Outlet />
            </div>
            <Footer className="flex-none w-full" />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </>
  )
}
