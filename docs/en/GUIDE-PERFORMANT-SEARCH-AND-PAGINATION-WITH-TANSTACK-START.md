# Guide: Performant Search & Pagination with TanStack Start

**Version:** 26.419.2

## Problem Description

Standard implementations of pagination in client-side apps often lead to a poor user experience and hidden bugs:

- **Hard transitions:** When changing pages, the content disappears and a loading spinner appears.
- **URL inconsistency:** Invalid parameters (e.g., ?page=abc) lead to crashes or errors.
- **Redundancy:** Default values are scattered throughout the project.
- **Performance:** Every search triggers a complete "re-fetch", which blocks the UI or causes flickering.
- **Hydration Errors:** The server often sorts URL parameters alphabetically (e.g., `?a=1&b=2`), while the client generates a different order via Zod schemas or object spreads (`?b=2&a=1`). This leads to React hydration crashes during initial load.

## The Solution: Architectural Components

The solution is based on a **Single Source of Truth** in the schema, **global URL stabilization** in the router, **streaming** in the server function, and **UI retention** (keeping the old data) during loading.

### A. Global URL Stabilization (Router Configuration)

To eliminate hydration errors (different URL string orders between server and client) once and for all, we force the TanStack Router to **always sort** search parameters alphabetically when generating links.

As a result, we are completely free in schema definition and parameter passing in the code, and no longer need to worry about the order of object keys.

**File:** `src/router.tsx` (or wherever the router is created)

```tsx
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function createRouter() {
  return createTanStackRouter({
    routeTree,
    // This function globally irons out all ordering problems!
    stringifySearch: (search) => {
      const keys = Object.keys(search).sort() // Alphabetical sorting is strictly required

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

### B. The Central Schema (search-params.ts)

Instead of setting defaults in components, we define them centrally in the Zod schema. We use `z.coerce` to automatically convert URL strings into numbers.

Since the router now handles parameter sorting, we can (and should) use practical Zod methods like `.extend()` to cleanly extend base schemas.

**File:** `src/schemas/search-params.ts`

```typescript
import { z } from 'zod'

export const PAGINATION_DEFAULTS = {
  page: 1,
  pageSize: 10,
  search: '',
} as const

// 1. Standard pagination schema (for simple lists)
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

// 2. Extended schema (Example: notes with tags and sorting)
// Thanks to stringifySearch in the router, we can use .extend() without fear of hydration errors!
export const notesSearchSchema = paginationSchema.extend({
  courseId: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  tagIds: z.array(z.string()).optional(),
})
```

- **`.catch()`**: Catches invalid types and resets them to the default instead of throwing an error.
- **`.default()`**: Applies when the parameter is completely missing from the URL.

### C. The Server Function (getCoursesFn)

The server function is split into **Logic** and **Handler**. The logic calculates the pagination and executes the queries in parallel.

**File:** `src/data/course.ts`

```typescript
// 1. The extracted logic (accessible for unit tests)
export async function getCoursesLogic(data: GetCoursesInput, userId: string) {
  const { prisma } = await import('#/lib/db.server')
  const { page, pageSize, search } = data
  const skip = (page - 1) * pageSize

  // Execute in parallel for better performance
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

// 2. The Server Function (RPC Entrypoint)
export const getCoursesFn = authGetFn
  .inputValidator(paginationSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    return await wrapServerAction('getCoursesFn', context, data, async () => {
      return getCoursesLogic(data, context.session.user.id)
    })
  })
```

### D. The Type-Safe Pagination Component

We use the TanStack `<Link>` component instead of buttons. This enables **preloading**: When the user hovers over "Next Page", the router already loads the data in the background.

Since the router now globally handles sorting, we can safely extend the `currentSearch` object using the spread operator without worrying about hydration errors.

**File:** `src/components/web/data-table-pagination.tsx`

```typescript
export function DataTablePagination({ totalCount, pageSize, page, currentSearch }: Props) {
  const totalPages = Math.ceil(totalCount / pageSize)
  const chevronClass = 'h-4 w-4'

  return (
    <div
      className={cn(
        totalPages <= 1
          ? 'hidden' // Hide if everything fits on one page
          : 'flex items-center justify-between px-2 py-4',
      )}
    >
      <div className="flex-1 text-sm text-muted-foreground">
        Total: {totalCount} entr{totalCount === 1 ? 'y' : 'ies'}
      </div>

      <div className="flex items-center space-x-2">
        {/* First page */}
        <Link
          // Simple spread is now 100% safe thanks to stringifySearch in the router!
          search={{ ...currentSearch, page: 1 }}
          preload="intent"
          className={linkStyles(page <= 1)}
          to="."
        >
          <ChevronFirst className={chevronClass} />
        </Link>
        {/* ... additional links (Previous, Next, Last) ... */}
      </div>
    </div>
  )
}
```

### E. The Route Configuration

In the route, we define `loaderDeps` so the loader knows it must re-fire whenever the search parameters change. `staleTime` ensures that already loaded pages remain in the cache.

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

### F. The "Flicker-Free" UI (RouteComponent)

This is the most important part for the user experience. We use `useDeferredValue` to display the old data while the new data is loading in the background. `useRouterState` provides the status for "graying out" the UI.

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
            replace: true, // prevents spam in the browser history
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
            This way, this component doesn't "suspend" immediately,
            but instead shows the old data (which is grayed out by the div above)
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

## Checklist for Additional Pages

To apply this pattern to other pages (e.g., `/tags` or `/notes`):

1. **Schema Architecture:** Was the base schema (`paginationSchema`) correctly extended using `.extend()` for specific routes?
2. **Server Function:** Does it return `{ items, totalCount }` within `wrapServerAction`? Is the schema passed directly into `.inputValidator()`?
3. **Loader:** Are `loaderDeps` set to the `search` params?
4. **DeferredValue:** Is `useDeferredValue` being used in the main component for the loader promise?
5. **Suspense:** Is the fallback set to `null` so that the `opacity-50` feedback takes the lead?
6. **Pagination:** Is the `currentSearch` object passed to the pagination (`search={{ ...currentSearch, page: X }}`), to avoid losing existing filters when changing pages?
