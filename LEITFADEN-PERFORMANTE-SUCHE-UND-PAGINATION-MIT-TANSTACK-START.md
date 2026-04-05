# Leitfaden: Performante Suche & Pagination mit TanStack Start

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

TypeScript

// src/schemas/search-params.ts  
import { z } from 'zod'

export const PAGINATION_DEFAULTS \= {  
 page: 1,  
 pageSize: 10,  
 search: '',  
} as const

export const paginationSchema \= z.object({  
 page: z.coerce.number().catch(PAGINATION_DEFAULTS.page).default(PAGINATION_DEFAULTS.page),  
 pageSize: z.coerce.number().catch(PAGINATION_DEFAULTS.pageSize).default(PAGINATION_DEFAULTS.pageSize),  
 search: z.string().catch(PAGINATION_DEFAULTS.search).default(PAGINATION_DEFAULTS.search),  
})

- **.catch()**: Fängt ungültige Typen ab und setzt sie auf den Default zurück, anstatt einen Error zu werfen.
- **.default()**: Greift, wenn der Parameter in der URL komplett fehlt.

### Die Server Function (getCoursesFn)

Die Server Function muss so umgebaut werden, dass sie nicht nur die Items, sondern auch die **Gesamtanzahl** (totalCount) zurückgibt, damit die Pagination weiß, wie viele Seiten existieren.

TypeScript

// src/data/course.ts  
export const getCoursesFn \= createServerFn({ method: 'GET' })  
 .validator((d: any) \=\> paginationSchema.parse(d)) // Validierung direkt am Eingang  
 .handler(async ({ data }) \=\> {  
 const { page, pageSize, search } \= data  
 const skip \= (page \- 1\) \* pageSize

    // Parallel ausführen für bessere Performance
    const \[items, totalCount\] \= await Promise.all(\[
      db.course.findMany({
        where: { title: { contains: search } },
        skip,
        take: pageSize,
      }),
      db.course.count({ where: { title: { contains: search } } }),
    \])

    return { items, totalCount, success: true }

})

### C. Die typsichere Pagination-Komponente

Wir nutzen die TanStack \<Link\>-Komponente anstelle von Buttons. Das ermöglicht **Preloading**: Wenn der User über "Nächste Seite" hovert, lädt der Router die Daten bereits im Hintergrund.

TypeScript

// src/components/web/data-table-pagination.tsx  
export function DataTablePagination({ totalCount, pageSize, page, currentSearch }: Props) {  
 const totalPages \= Math.ceil(totalCount / pageSize)

return (  
 \<Link  
 to="." // Aktuelle Route beibehalten  
 search={{ ...currentSearch, page: page \+ 1 }} // Parameter mergen  
 preload="intent" // Magie: Lädt beim Hovern im Hintergrund  
 className={cn(buttonVariants({ variant: 'outline' }), page \>= totalPages && "opacity-50")}  
 \>  
 \<ChevronRight className="h-4 w-4" /\>  
 \</Link\>  
 )  
}

### D. Die Route-Konfiguration

In der Route definieren wir loaderDeps, damit der Loader weiß, dass er bei jeder Änderung der Suchparameter neu feuern muss. staleTime sorgt dafür, dass bereits geladene Seiten im Cache bleiben.

TypeScript

// src/routes/courses/index.tsx  
export const Route \= createFileRoute('/\_content/courses/')({  
 validateSearch: (search) \=\> paginationSchema.parse(search),  
 loaderDeps: ({ search }) \=\> ({ search }),  
 staleTime: 60000,  
 loader: ({ deps }) \=\> ({  
 coursesPromise: getCoursesFn({ data: deps.search }),  
 }),  
})

### E. Die "flackerfreie" UI (RouteComponent)

Dies ist der wichtigste Teil für das User-Gefühl. Wir nutzen useDeferredValue, um die alten Kurse anzuzeigen, während die neuen im Hintergrund geladen werden. useRouterState liefert den Status für das "Ausgrauen".

TypeScript

function RouteComponent() {  
 const { coursesPromise } \= Route.useLoaderData()  
 const searchParams \= Route.useSearch()

// 1\. Altes Promise "festhalten" während das neue lädt  
 const deferredPromise \= useDeferredValue(coursesPromise)

// 2\. Globalen Ladezustand des Routers abfragen  
 const isNavigating \= useRouterState({ select: (s) \=\> s.status \=== 'pending' })

return (  
 \<div className="space-y-4"\>  
 \<DataTableSearch value={searchParams.search} onSearchChange={(v) \=\> ...} /\>

      \<div className={cn("transition-opacity", isNavigating ? "opacity-50" : "opacity-100")}\>
        \<Suspense fallback={null}\>
          \<CoursesList
            data={deferredPromise}
            page={searchParams.page}
            pageSize={searchParams.pageSize}
          /\>
        \</Suspense\>
      \</div\>
    \</div\>

)  
}

## Checkliste für weitere Seiten

Um dieses Muster auf andere Seiten (z.B. /tags) zu übertragen:

1. **Schema prüfen:** Reicht paginationSchema aus oder müssen neue Filter (z.B. sort) dazu?
2. **Server Function:** Gibt sie { items, totalCount } zurück?
3. **Loader:** Sind loaderDeps auf die search-Params gesetzt?
4. **DeferredValue:** Wird in der Hauptkomponente useDeferredValue für das Loader-Promise genutzt?
5. **Suspense:** Ist der Fallback auf null gesetzt, damit das opacity-50 Feedback die Führung übernimmt?
6. **Pagination:** Wird das currentSearch Objekt an die Pagination übergeben, um bestehende Filter beim Seitenwechsel nicht zu verlieren?
