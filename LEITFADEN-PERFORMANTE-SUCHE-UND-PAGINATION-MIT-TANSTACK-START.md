# Leitfaden: Performante Suche & Pagination mit TanStack Start

**Version:** 26.410.1

## Problembeschreibung

Standard-Implementierungen von Pagination in Client-Side-Apps führen oft zu einer schlechten User Experience:

- **Harte Umbrüche:** Beim Seitenwechsel verschwindet der Inhalt und ein Lade-Spinner erscheint.
- **URL-Inkonsistenz:** Ungültige Parameter (z.B. ?page=abc) führen zu Abstürzen oder Fehlern.
- **Redundanz:** Standardwerte (Defaults) sind über das ganze Projekt verstreut.
- **Performance:** Jede Suche triggert einen kompletten "Re-Fetch", der die UI blockiert oder flackern lässt.

## Die Lösung: Architektur-Komponenten

Die Lösung basiert auf einer **Single Source of Truth** im Schema, **Streaming** in der Server Function und **UI-Retention** (Beibehalten der alten Daten) während des Ladens.

### Das zentrale Schema (search-params.ts)

Anstatt Defaults in Komponenten zu setzen, definieren wir sie zentral im Zod-Schema. Wir nutzen z.coerce, um URL-Strings (aus dem Browser) automatisch in Zahlen umzuwandeln.

**Datei:** `src/schemas/search-params.ts`

```typescript
import { z } from 'zod'

export const PAGINATION_DEFAULTS = {
  page: 1,
  pageSize: 10,
  search: '',
} as const

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
```

- **.catch()**: Fängt ungültige Typen ab und setzt sie auf den Default zurück, anstatt einen Error zu werfen.
- **.default()**: Greift, wenn der Parameter in der URL komplett fehlt.

In TanStack Start will man bei der Behandlung der Search Params in der URL in fast 100% der Fälle immer beides machen.

### B. Die Server Function (getCoursesFn)

Die Server Function muss so umgebaut werden, dass sie nicht nur die Items, sondern auch die **Gesamtanzahl** (totalCount) zurückgibt, damit die Pagination weiß, wie viele Seiten existieren. Zudem muss sie unsere neue `wrapServerAction` Architektur und die direkte Übergabe im `.inputValidator` nutzen.

**Datei:** `src/data/course.ts`

```typescript
export const getCoursesFn = createServerFn({ method: 'GET' })
  .inputValidator(paginationSchema) // Validierung direkt am Eingang (ohne Pfeilfunktion!)
  .handler(async ({ data, context }) => {
    return await wrapServerAction('getCoursesFn', context, data, async () => {
      const { page, pageSize, search } = data
      const skip = (page - 1) * pageSize

      // Parallel ausführen für bessere Performance
      const [items, totalCount] = await Promise.all([
        db.course.findMany({
          where: { title: { contains: search } },
          skip,
          take: pageSize,
        }),
        db.course.count({ where: { title: { contains: search } } }),
      ])

      // success: true wird automatisch von wrapServerAction hinzugefügt
      return { items, totalCount }
    })
  })
```

### C. Die typsichere Pagination-Komponente

Wir nutzen die TanStack \<Link\>-Komponente anstelle von Buttons. Das ermöglicht **Preloading**: Wenn der User über "Nächste Seite" hovert, lädt der Router die Daten bereits im Hintergrund.

**Datei:** `src/components/web/data-table-pagination.tsx`

```typescript
export function DataTablePagination({ totalCount, pageSize, page, currentSearch }: Props) {
 const totalPages = Math.ceil(totalCount / pageSize)

  const chevronClass = 'h-4 w-4'

  return (
    <div
      className={cn(
        totalPages === 1
          ? 'hidden'
          : 'flex items-center justify-between px-2 py-4',
      )}
    >
      <div className="flex-1 text-sm text-muted-foreground">
        Total: {totalCount} entr{totalCount === 1 ? 'y' : 'ies'}
      </div>

      <div className="flex items-center space-x-2">
        {/* Erste Seite */}
        <Link
          // Wir übergeben das Ziel-Objekt direkt.
          // Durch den Spread von currentSearch behalten wir Filter wie 'search' oder 'tagIds' bei.
          search={{ ...currentSearch, page: 1 }}
          preload="intent"
          className={linkStyles(page <= 1)}
          to="."
        >
          <ChevronFirst className={chevronClass} />
        </Link>
        ...
      </div>
    </div>
  )
}
```

Mit dem angegebenen className im äußersten div blenden wir die Pagination-Komponente aus, wenn sich alles auf einer Seite ausgeht (es gibt dann nichts wo man zwischen den Seiten wechseln muss - also können wir den Platz der Pagination Komponente dem Inhalt "überlassen")

### D. Die Route-Konfiguration

In der Route definieren wir loaderDeps, damit der Loader weiß, dass er bei jeder Änderung der Suchparameter neu feuern muss. staleTime sorgt dafür, dass bereits geladene Seiten im Cache bleiben.

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

### E. Die "flackerfreie" UI (RouteComponent)

Dies ist der wichtigste Teil für das User-Gefühl. Wir nutzen useDeferredValue, um die alten Kurse anzuzeigen, während die neuen im Hintergrund geladen werden. useRouterState liefert den Status für das "Ausgrauen".

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
            replace: true, // verhindert, dass jeder getippte Buchstabe einen Eintrag in der Browser-Historie erzeugt
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

Um **Hydration Mismatch** zu verhindern (der Server rendert etwas anderes wie der Client) müssen wir sicherstellen, dass `isPending` nur auf dem Client aktiviert wird. Das erreichen wir durch den useEffect, der `mounted` auf `true` setzt, sobald der Initial Render am Client abgeschlossen wurde. Das verwenden wir dann um `isNavigating` nur dann auf `true` zu setzen, wenn der Router im `pending` State ist und der initial Render schon abgeschlossen wurde.

## Checkliste für weitere Seiten

Um dieses Muster auf andere Seiten (z.B. /tags) zu übertragen:

1. **Schema prüfen:** Reicht paginationSchema aus oder müssen neue Filter (z.B. sort) dazu?
2. **Server Function:** Gibt sie `{ items, totalCount }` innerhalb von `wrapServerAction` zurück? Ist das Schema direkt in `.inputValidator()` übergeben?
3. **Loader:** Sind loaderDeps auf die search-Params gesetzt?
4. **DeferredValue:** Wird in der Hauptkomponente useDeferredValue für das Loader-Promise genutzt?
5. **Suspense:** Ist der Fallback auf null gesetzt, damit das opacity-50 Feedback die Führung übernimmt?
6. **Pagination:** Wird das currentSearch Objekt an die Pagination übergeben, um bestehende Filter beim Seitenwechsel nicht zu verlieren?
