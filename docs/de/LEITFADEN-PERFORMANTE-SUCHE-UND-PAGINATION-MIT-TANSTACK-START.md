# Leitfaden: Performante Suche & Pagination mit TanStack Start

**Version:** 26.419.2

## Problembeschreibung

Standard-Implementierungen von Pagination in Client-Side-Apps führen oft zu einer schlechten User Experience und versteckten Bugs:

- **Harte Umbrüche:** Beim Seitenwechsel verschwindet der Inhalt und ein Lade-Spinner erscheint.
- **URL-Inkonsistenz:** Ungültige Parameter (z.B. ?page=abc) führen zu Abstürzen oder Fehlern.
- **Redundanz:** Standardwerte (Defaults) sind über das ganze Projekt verstreut.
- **Performance:** Jede Suche triggert einen kompletten "Re-Fetch", der die UI blockiert oder flackern lässt.
- **Hydration Errors:** Der Server sortiert URL-Parameter oft alphabetisch (z.B. `?a=1&b=2`), während der Client durch Zod-Schemata oder Object-Spreads eine andere Reihenfolge generiert (`?b=2&a=1`). Dies führt zu React-Hydration-Crashes beim initialen Laden.

## Die Lösung: Architektur-Komponenten

Die Lösung basiert auf einer **Single Source of Truth** im Schema, **globaler URL-Stabilisierung** im Router, **Streaming** in der Server Function und **UI-Retention** (Beibehalten der alten Daten) während des Ladens.

### A. Globale URL-Stabilisierung (Router-Konfiguration)

Um Hydration-Errors (unterschiedliche URL-String-Reihenfolgen zwischen Server und Client) ein für alle Mal zu eliminieren, zwingen wir den TanStack Router dazu, Search-Parameter beim Generieren von Links **immer alphabetisch** zu sortieren.

Dadurch sind wir bei der Schema-Definition und beim Übergeben von Parametern im Code völlig frei und müssen nicht auf die Reihenfolge der Objekt-Schlüssel achten.

**Datei:** `src/router.tsx` (bzw. dort, wo der Router erstellt wird)

```tsx
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function createRouter() {
  return createTanStackRouter({
    routeTree,
    // Diese Funktion bügelt alle Reihenfolge-Probleme global glatt!
    stringifySearch: (search) => {
      const keys = Object.keys(search).sort() // Alphabetische Sortierung zwingend erforderlich

      const pairs = keys
        .map((key) => {
          const value = search[key]
          if (value === undefined || value === null) return null

          const valString =
            typeof value === 'object' ? JSON.stringify(value) : String(value)

          return `${encodeURIComponent(key)}=${encodeURIComponent(valString)}`
        })
        .filter(Boolean)

      return pairs.length > 0 ? `?${pairs.join('&')}` : ''
    },
  })
}
```

### B. Das zentrale Schema (search-params.ts)

Anstatt Defaults in Komponenten zu setzen, definieren wir sie zentral im Zod-Schema. Wir nutzen `z.coerce`, um URL-Strings automatisch in Zahlen umzuwandeln.

Da der Router nun die Sortierung der Parameter übernimmt, können (und sollten) wir die praktischen Methoden von Zod wie `.extend()` nutzen, um Basis-Schemata sauber zu erweitern.

**Datei:** `src/schemas/search-params.schema'.ts`

```typescript
import { z } from 'zod'

export const PAGINATION_DEFAULTS = {
  page: 1,
  pageSize: 10,
  search: '',
} as const

// 1. Standard-Pagination-Schema (für einfache Listen)
export const paginationSchema = z.object({
  page: z.coerce
    .number()
    .catch(PAGINATION_DEFAULTS.page)
    .default(PAGINATION_DEFAULTS.page),
  pageSize: z.coerce
    .number()
    .catch(PAGINATION_DEFAULTS.pageSize)
    .default(PAGINATION_DEFAULTS.pageSize),
  search: z
    .string()
    .catch(PAGINATION_DEFAULTS.search)
    .default(PAGINATION_DEFAULTS.search),
})

// 2. Erweitertes Schema (Beispiel: Notizen mit Tags und Sortierung)
// Dank stringifySearch im Router können wir .extend() ohne Angst vor Hydration-Errors nutzen!
export const notesSearchSchema = paginationSchema.extend({
  courseId: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  tagIds: z.array(z.string()).optional(),
})
```

- **.catch()**: Fängt ungültige Typen ab und setzt sie auf den Default zurück, anstatt einen Error zu werfen.
- **.default()**: Greift, wenn der Parameter in der URL komplett fehlt.

### C. Die Server Function (getCoursesFn)

Die Server Function wird in **Logik** und **Handler** aufgeteilt. Die Logik berechnet die Pagination und führt die Abfragen parallel aus.

**Datei:** `src/data/course.ts`

```typescript
// 1. Die extrahierte Logik (für Unit-Tests zugänglich)
export async function getCoursesLogic(data: GetCoursesInput, userId: string) {
  const { prisma } = await import('#/lib/db.lib.server')
  const { page, pageSize, search } = data
  const skip = (page - 1) * pageSize

  // Parallel ausführen für bessere Performance
  const [items, totalCount] = await Promise.all([
    prisma.course.findMany({
      where: { userId, title: { contains: search, mode: 'insensitive' } },
      skip,
      take: pageSize,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.course.count({
      where: { userId, title: { contains: search, mode: 'insensitive' } },
    }),
  ])

  return { items, totalCount }
}

// 2. Die Server Function (RPC-Entrypoint)
export const getCoursesFn = authGetFn
  .inputValidator(paginationSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.lib.server')
    return await wrapServerAction('getCoursesFn', context, data, async () => {
      return getCoursesLogic(data, context.session.user.id)
    })
  })
```

### D. Die typsichere Pagination-Komponente

Wir nutzen die TanStack `<Link>`-Komponente anstelle von Buttons. Das ermöglicht **Preloading**: Wenn der User über "Nächste Seite" hovert, lädt der Router die Daten bereits im Hintergrund.

Da der Router nun global die Sortierung übernimmt, können wir das `currentSearch`-Objekt gefahrlos mit dem Spread-Operator erweitern, ohne uns um Hydration Errors zu sorgen.

**Datei:** `src/components/web/data-table-pagination.tsx`

```typescript
export function DataTablePagination({ totalCount, pageSize, page, currentSearch }: Props) {
  const totalPages = Math.ceil(totalCount / pageSize)
  const chevronClass = 'h-4 w-4'

  return (
    <div
      className={cn(
        totalPages <= 1
          ? 'hidden' // Ausblenden, wenn alles auf eine Seite passt
          : 'flex items-center justify-between px-2 py-4',
      )}
    >
      <div className="flex-1 text-sm text-muted-foreground">
        Total: {totalCount} entr{totalCount === 1 ? 'y' : 'ies'}
      </div>

      <div className="flex items-center space-x-2">
        {/* Erste Seite */}
        <Link
          // Einfacher Spread ist jetzt 100% sicher dank `stringifySearch` im Router!
          search={{ ...currentSearch, page: 1 }}
          preload="intent"
          className={linkStyles(page <= 1)}
          to="."
        >
          <ChevronFirst className={chevronClass} />
        </Link>
        {/* ... weitere Links (Vorherige, Nächste, Letzte) ... */}
      </div>
    </div>
  )
}
```

### E. Die Route-Konfiguration

In der Route definieren wir `loaderDeps`, damit der Loader weiß, dass er bei jeder Änderung der Suchparameter neu feuern muss. `staleTime` sorgt dafür, dass bereits geladene Seiten im Cache bleiben.

**Datei:** `src/routes/courses/index.tsx`

```typescript
export const Route = createFileRoute('/_content/courses/')({
  validateSearch: (search) => paginationSchema.parse(search),
  loaderDeps: ({ search }) => ({ search }),
  staleTime: 60000,
  loader: ({ deps }) => ({
    coursesPromise: getCoursesFn({ data: deps.search }),
  }),
})
```

### F. Die "flackerfreie" UI (RouteComponent)

Dies ist der wichtigste Teil für das User-Gefühl. Wir nutzen `useDeferredValue`, um die alten Daten anzuzeigen, während die neuen im Hintergrund geladen werden. `useRouterState` liefert den Status für das "Ausgrauen".

**Datei:** `src/routes/_content/courses/index.tsx`

```typescript
function RouteComponent() {
  const { coursesPromise } = Route.useLoaderData()
  const searchParams = Route.useSearch()
  const navigate = Route.useNavigate()

  // Hier passiert die Magie:
  // deferredPromise hinkt dem eigentlichen coursesPromise hinterher.
  // React behält das alte Promise so lange "aktiv", bis das neue aufgelöst ist.
  const deferredPromise = useDeferredValue(coursesPromise)

  // Status-Check
  const pending = useRouterState({ select: (s) => s.status === 'pending' })

  // Hydration-Schutz:
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  const isNavigating = mounted && pending

  return (
    <div className="space-y-4">
      <DataTableSearch
        value={searchParams.search}
        onSearchChange={(text) => {
          navigate({
            search: (prev) => ({ ...prev, search: text, page: 1 }),
            replace: true, // verhindert Spam in der Browser-Historie
          })
        }}
      />

      <div
        className={cn(
          'transition-opacity duration-300',
          isNavigating ? 'opacity-50 pointer-events-none' : 'opacity-100',
        )}
      >
        <Suspense fallback={null}>
          {/* WICHTIG: Wir übergeben das DEFERRED Promise.
            Dadurch "suspensed" diese Komponente nicht sofort,
            sondern zeigt die alten Daten (die durch das div oben
            ausgegraut sind), bis die neuen Daten bereit sind.
          */}
          <CoursesList
            data={deferredPromise}
            page={searchParams.page}
            pageSize={searchParams.pageSize}
          />
        </Suspense>
      </div>
    </div>
  )
}
```

## Checkliste für weitere Seiten

Um dieses Muster auf andere Seiten (z.B. `/tags` oder `/notes`) zu übertragen:

1. **Schema Architektur:** Wurde das Basis-Schema (`paginationSchema`) korrekt mit `.extend()` für spezifische Routen erweitert?
2. **Server Function:** Gibt sie `{ items, totalCount }` innerhalb von `wrapServerAction` zurück? Ist das Schema direkt in `.inputValidator()` übergeben?
3. **Loader:** Sind `loaderDeps` auf die `search`-Params gesetzt?
4. **DeferredValue:** Wird in der Hauptkomponente `useDeferredValue` für das Loader-Promise genutzt?
5. **Suspense:** Ist der Fallback auf `null` gesetzt, damit das `opacity-50` Feedback die Führung übernimmt?
6. **Pagination:** Wird das `currentSearch` Objekt an die Pagination übergeben (`search={{ ...currentSearch, page: X }}`), um bestehende Filter beim Seitenwechsel nicht zu verlieren?
