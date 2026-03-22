import { AppSidebar } from '#/components/app-sidebar'
import Footer from '#/components/Footer'
import { Separator } from '#/components/ui/separator'
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
      <SidebarProvider className="min-h-[calc(100vh-64px)]">
        <AppSidebar user={user} />
        <SidebarInset className="flex w-full">
          {/* <Separator
            orientation="vertical"
            className="mr-2 data-[orientation=vertical]:h-4"
          /> */}
          <div className="flex-1 *:mx-auto mt-4">
            <Outlet />
          </div>
          <Footer />
        </SidebarInset>
      </SidebarProvider>
    </>
  )
}
