import { AppSidebar } from '#/components/app-sidebar'
import Footer from '#/components/Footer'
import { SidebarInset, SidebarProvider } from '#/components/ui/sidebar'
import { getSessionFn } from '#/data/session.data'
import { getTagsForSelectorFn } from '#/data/tag.data'
import { userSettingsQueryOptions } from '#/data/user.data'
import { useSettings } from '#/hooks/use-user-settings.hook'
import { queryOptions } from '@tanstack/react-query'
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

export const tagsQueryOptions = queryOptions({
  queryKey: ['availableTags'],
  queryFn: async () => {
    const result = await getTagsForSelectorFn({
      data: { loggingMetadata: { component: 'GlobalTagQuery' } },
    })
    return result.success ? result.data : []
  },
  // Wichtig für Performance: Wir sagen dem Cache, dass diese Daten für
  // 5 Minuten "frisch" (fresh) sind, bevor er sie im Hintergrund neu lädt.
  staleTime: 1000 * 60 * 5,
})

export const Route = createFileRoute('/_content')({
  component: RouteComponent,
  loader: async ({ context }) => {
    const sessionResult = await getSessionFn()

    // 2. Prüfen, ob der Aufruf erfolgreich war
    if (!sessionResult.success) {
      // Falls die Session nicht geladen werden konnte,
      // werfen wir einen Error oder redirecten.
      // Hinweis: Da authFnMiddleware bereits redirectet,
      // sollte dieser Fall hier selten eintreten.
      throw new Error(sessionResult.error || 'Session could not be loaded')
    }

    // 2. Daten über Tanstack Query parallel laden
    // 'ensureQueryData' ist magisch: Wenn die Tags schon im Cache sind,
    // gibt es sie sofort zurück. Wenn nicht, ruft es die Server Function auf.
    const [availableTags, userSettings] = await Promise.all([
      context.queryClient.ensureQueryData(tagsQueryOptions),
      context.queryClient.ensureQueryData(userSettingsQueryOptions()), // <-- NEU
    ])

    // 3. Die Daten aus dem .data Feld extrahieren
    // result.data ist hier vom Typ 'Session'
    return {
      user: sessionResult.data.user,
      availableTags,
      userSettings,
    }
  },
})

function RouteComponent() {
  const { user } = Route.useLoaderData()
  const { settings, updateSettings } = useSettings()
  const [mounted, setMounted] = useState(false)
  const isSidebarOpen = settings?.ui.sidebar
    ? !settings.ui.sidebar.collapsed
    : true
  useEffect(() => setMounted(true), [])
  if (!mounted) return <div className="w-32 h-8" />

  return (
    <>
      <SidebarProvider
        className="h-full"
        open={isSidebarOpen} // Zwinge den State
        onOpenChange={(isOpen) => {
          updateSettings({ ui: { sidebar: { collapsed: !isOpen } } }).catch(
            () => {},
          )
        }}
      >
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
