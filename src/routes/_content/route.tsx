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
      <SidebarProvider>
        <AppSidebar user={user} />
        <SidebarInset className="flex w-full">
          <div className="flex-1 *:mx-auto mt-4">
            <Outlet />
          </div>
          <Footer />
        </SidebarInset>
      </SidebarProvider>
    </>
  )
}
