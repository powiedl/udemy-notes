import { AppSidebar } from '#/components/app-sidebar'
import Footer from '#/components/Footer'
import { SidebarInset, SidebarProvider } from '#/components/ui/sidebar'
import { getSessionFn } from '#/data/session'
import { getTagsForSelectorFn } from '#/data/tag'
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_content')({
  component: RouteComponent,
  loader: async () => {
    // 1. Das Ergebnis der Server Function abrufen
    const [sessionResult, tagsResult] = await Promise.all([
      getSessionFn(),
      getTagsForSelectorFn({
        data: { loggingMetadata: { component: 'MainLayoutLoader' } },
      }),
    ])

    // 2. Prüfen, ob der Aufruf erfolgreich war
    if (!sessionResult.success) {
      // Falls die Session nicht geladen werden konnte,
      // werfen wir einen Error oder redirecten.
      // Hinweis: Da authFnMiddleware bereits redirectet,
      // sollte dieser Fall hier selten eintreten.
      throw new Error(
        sessionResult.error || 'Session konnte nicht geladen werden',
      )
    }

    // 3. Die Daten aus dem .data Feld extrahieren
    // result.data ist hier vom Typ 'Session'
    return {
      user: sessionResult.data.user,
      availableTags: tagsResult?.success ? tagsResult.data : [],
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
          <div className="flex-1 overflow-y-auto flex flex-col mt-4">
            <div className="main-content flex-1 w-full max-w-6xl mx-auto *:mx-auto px-8 -py-8">
              <Outlet />
            </div>
            <Footer className="flex-none w-full" />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </>
  )
}
