# Guide: Performant Search & Pagination with TanStack Start

**Version:** 26.409.1

## Problem Description

Standard implementations of pagination in client-side apps often lead to a poor user experience:

- **Hard breaks:** When changing pages, the content disappears and a loading spinner appears.
- **URL Inconsistency:** Invalid parameters (e.g., ?page=abc) lead to crashes or errors.
- **Redundancy:** Default values are scattered throughout the entire project.
- **Performance:** Every search triggers a complete "re-fetch" that blocks the UI or causes flickering.

## The Solution: Architectural Components

The solution is based on a **Single Source of Truth** in the schema, **Streaming** in the Server Function, and **UI Retention** (keeping old data) during loading.

### The Central Schema (search-params.ts)

Instead of setting defaults in components, we define them centrally in the Zod schema. We use z.coerce to automatically convert URL strings (from the browser) into numbers.

**File:** `src/schemas/search-params.ts`

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

- **.catch()**: Catches invalid types and resets them to the default instead of throwing an error.
- **.default()**: Applies when the parameter is completely missing from the URL.

In TanStack Start, when handling Search Params in the URL, you almost 100% of the time want to do both.

### The Server Function (getCoursesFn)

The Server Function must be restructured to return not only the items but also the **total count** (totalCount), so the pagination knows how many pages exist.

**File:** `src/data/course.ts`

```typescript
export const getCoursesFn = createServerFn({ method: 'GET' })
  .validator((d: any) => paginationSchema.parse(d)) // Validation directly at the entry point
  .handler(async ({ data }) => {
    const { page, pageSize, search } = data
    const skip = (page - 1) * pageSize

    // Execute in parallel for better performance
    const [items, totalCount] = await Promise.all([
      db.course.findMany({
        where: { title: { contains: search } },
        skip,
        take: pageSize,
      }),
      db.course.count({ where: { title: { contains: search } } }),
    ])

    return { items, totalCount, success: true }
  })
```

### C. The Type-Safe Pagination Component

We use the TanStack \<Link\> component instead of buttons. This enables **preloading**: When the user hovers over "Next Page", the router already loads the data in the background.

**File:** `src/components/web/data-table-pagination.tsx`

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
        {/* First Page */}
        <Link
          // We pass the target object directly.
          // By spreading currentSearch, we maintain filters like 'search' or 'tagIds'.
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

With the specified className in the outer div, we hide the pagination component if everything fits on one page (there is then nothing to switch between pages - so we can "leave" the space of the pagination component to the content).

### D. The Route Configuration

In the route, we define loaderDeps so the loader knows it needs to refire every time the search parameters change. staleTime ensures that already loaded pages remain in the cache.

**File:** `src/routes/courses/index.tsx`

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

### E. The "Flicker-Free" UI (RouteComponent)

This is the most important part for the user feel. We use useDeferredValue to display the old courses while the new ones are loaded in the background. useRouterState provides the status for the "graying out" effect.

**File:** `src/routes/_content/courses/index.tsx`

```typescript
function RouteComponent() {
  const { coursesPromise } = Route.useLoaderData()
  const searchParams = Route.useSearch()
  const navigate = Route.useNavigate()

  // This is where the magic happens:
  // deferredPromise lags behind the actual coursesPromise.
  // React keeps the old promise "active" until the new one is resolved.
  const deferredPromise = useDeferredValue(coursesPromise)

  // Status Check
  const pending = useRouterState({ select: (s) => s.status === 'pending' })

  // Hydration Protection:
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
            replace: true, // prevents every typed letter from creating an entry in the browser history
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
          {/* IMPORTANT: We pass the DEFERRED promise.
            As a result, this component does not "suspense" immediately,
            but shows the old data (which is grayed out by the div above)
            until the new data is ready.
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

To prevent **Hydration Mismatch** (where the server renders something different from the client), we must ensure that `isPending` is only activated on the client. We achieve this through the useEffect that sets `mounted` to `true` once the initial render on the client is complete. We then use this to set `isNavigating` to `true` only when the router is in the `pending` state and the initial render has already been completed.

## Checklist for Other Pages

To transfer this pattern to other pages (e.g., /tags):

1. **Check Schema:** Is paginationSchema sufficient or do new filters (e.g., sort) need to be added?
2. **Server Function:** Does it return { items, totalCount }?
3. **Loader:** Are loaderDeps set to the search params?
4. **DeferredValue:** Is useDeferredValue used in the main component for the loader promise?
5. **Suspense:** Is the fallback set to null so the opacity-50 feedback takes over?
6. **Pagination:** Is the currentSearch object passed to the pagination to avoid losing existing filters during a page change?
