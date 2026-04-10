# Guide: Performant Search & Pagination with TanStack Start

**Version:** 26.410.1

## Problem Description

Standard implementations of pagination in client-side apps often lead to a poor user experience:

- **Hard transitions:** When changing pages, the content disappears and a loading spinner appears.
- **URL inconsistency:** Invalid parameters (e.g., ?page=abc) cause crashes or errors.
- **Redundancy:** Default values are scattered throughout the project.
- **Performance:** Every search triggers a complete "re-fetch", which blocks or flickers the UI.

## The Solution: Architectural Components

The solution is based on a **Single Source of Truth** in the schema, **Streaming** in the Server Function, and **UI retention** (keeping the old data) during loading.

### The Central Schema (search-params.ts)

Instead of setting defaults in components, we define them centrally in the Zod schema. We use `z.coerce` to automatically convert URL strings (from the browser) into numbers.

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

In TanStack Start, when handling search params in the URL, you almost 100% of the time want to do both.

### B. The Server Function (getCoursesFn)

The Server Function must be refactored so that it returns not only the items but also the **total count** (`totalCount`), so the pagination knows how many pages exist. Furthermore, it must use our new `wrapServerAction` architecture and direct passing in `.inputValidator`.

**File:** `src/data/course.ts`

```typescript
export const getCoursesFn = createServerFn({ method: 'GET' })
  .inputValidator(paginationSchema) // Validation directly at the input (no arrow function!)
  .handler(async ({ data, context }) => {
    return await wrapServerAction('getCoursesFn', context, data, async () => {
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

      // success: true is automatically added by wrapServerAction
      return { items, totalCount }
    })
  })
```

### C. The Type-Safe Pagination Component

We use the TanStack \<Link\>-component instead of buttons. This enables **preloading**: When the user hovers over "Next page", the router already loads the data in the background.

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
        {/* First page */}
        <Link
          // We pass the target object directly.
          // By spreading currentSearch we keep filters like 'search' or 'tagIds'.
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

With the specified `className` in the outermost `div`, we hide the pagination component if everything fits on one page (there is nothing to switch between pages then - so we can "yield" the space of the pagination component to the content).

### D. The Route Configuration

In the route, we define `loaderDeps` so the loader knows it has to re-fire on every change of the search parameters. `staleTime` ensures that already loaded pages remain in the cache.

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

This is the most important part for the user feel. We use `useDeferredValue` to display the old courses while the new ones are loaded in the background. `useRouterState` provides the status for the "graying out".

**File:** `src/routes/_content/courses/index.tsx`

```typescript
function RouteComponent() {
  const { coursesPromise } = Route.useLoaderData()
  const searchParams = Route.useSearch()
  const navigate = Route.useNavigate()

  // Here is where the magic happens:
  // deferredPromise lags behind the actual coursesPromise.
  // React keeps the old promise "active" until the new one is resolved.
  const deferredPromise = useDeferredValue(coursesPromise)

  // Status check
  const pending = useRouterState({ select: (s) => s.status === 'pending' })

  // Hydration protection:
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
            This way, this component doesn't "suspense" immediately,
            but shows the old data (which is grayed out by the div above),
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

To prevent a **Hydration Mismatch** (the server rendering something different than the client), we must ensure that `isPending` is only activated on the client. We achieve this through the `useEffect`, which sets `mounted` to `true` as soon as the initial render on the client is complete. We then use this to set `isNavigating` to `true` only if the router is in the `pending` state and the initial render has already been completed.

## Checklist for Additional Pages

To apply this pattern to other pages (e.g., /tags):

1. **Check schema:** Is `paginationSchema` sufficient or do new filters (e.g., `sort`) need to be added?
2. **Server Function:** Does it return `{ items, totalCount }` inside `wrapServerAction`? Is the schema passed directly into `.inputValidator()`?
3. **Loader:** Are `loaderDeps` set to the search params?
4. **DeferredValue:** Is `useDeferredValue` used for the loader promise in the main component?
5. **Suspense:** Is the fallback set to `null` so that the `opacity-50` feedback takes the lead?
6. **Pagination:** Is the `currentSearch` object passed to the pagination so that existing filters are not lost when changing pages?
