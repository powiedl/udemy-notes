import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { createQueryClient } from '#/lib/query.lib'

export function getRouter() {
  const queryClient = createQueryClient()
  const router = createTanStackRouter({
    routeTree,
    // Diese Funktion bügelt alle Reihenfolge-Probleme global glatt!
    stringifySearch: (search) => {
      const keys = Object.keys(search).sort()

      const pairs = keys
        .map((key) => {
          const value = search[key]
          if (value === undefined || value === null) return null

          // WICHTIG: TanStack Router erwartet oft, dass Arrays/Objekte
          // speziell serialisiert werden. Hier nutzen wir JSON.stringify
          // für alles, was kein einfacher Datentyp ist.
          const valString =
            typeof value === 'object' ? JSON.stringify(value) : String(value)

          return `${encodeURIComponent(key)}=${encodeURIComponent(valString)}`
        })
        .filter(Boolean) // Entfernt die null-Einträge

      return pairs.length > 0 ? `?${pairs.join('&')}` : ''
    },
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
