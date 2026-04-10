import { DataTablePagination } from '#/components/web/data-table-pagination'
import { DataTableSearch } from '#/components/web/data-table-search'
import Tag from '#/components/web/tag'
import { getAvailableTagsFn } from '#/data/tag'
import { cn } from '#/lib/utils'
import { tagPaginationSchema } from '#/schemas/search-params'
import { createFileRoute, useRouterState } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { Suspense, use, useDeferredValue, useEffect, useState } from 'react'

export const Route = createFileRoute('/_content/tags/')({
  component: RouteComponent,
  validateSearch: (search) => tagPaginationSchema.parse(search),
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ deps }) => ({
    tagsPromise: getAvailableTagsFn({ data: deps.search }),
  }),
})

function Tags({ data }: { data: ReturnType<typeof getAvailableTagsFn> }) {
  const result = use(data)
  if (!result.success)
    return (
      <div className="p-4 border border-red-500 bg-red-50 text-red-700 rounded">
        <p>Error while loading the tags</p>
        <pre>{result.error}</pre>
      </div>
    )
  const tags = result.data

  //console.log('Tags,result', result)
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {tags.items.map((t) => (
        <Tag key={t.id} tag={t} />
      ))}
    </div>
  )
}
function RouteComponent() {
  const { tagsPromise } = Route.useLoaderData() // Das Promise vom Loader
  const searchParams = Route.useSearch()
  const navigate = Route.useNavigate()
  const deferredPromise = useDeferredValue(tagsPromise)

  // 1. Den Navigations-Status vom Router abgreifen
  const pending = useRouterState({ select: (s) => s.status === 'pending' })

  // 2. Hydration-Schutz (damit Server und Client nicht streiten)
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  // 3. Die Variable definieren, die du im JSX verwendest
  const isNavigating = mounted && pending
  const result = use(deferredPromise)
  if (!result.success) return <div>Fehler: {result.error}</div>

  return (
    <div className="space-y-4 px-4">
      {/* 1. Die Suchleiste hinzufügen */}
      <DataTableSearch
        value={searchParams.search}
        onSearchChange={(text) => {
          navigate({
            search: (prev) => ({ ...prev, search: text, page: 1 }),
            replace: true,
          })
        }}
      />

      <div className={cn(isNavigating ? 'opacity-50' : 'opacity-100')}>
        <Suspense fallback={<Loader2 className="animate-spin mx-auto" />}>
          {/* 2. Die Liste rendern (die jetzt .items nutzt) */}
          <Tags data={deferredPromise} />

          {/* 3. Den Pagination-Footer hinzufügen */}
          <DataTablePagination
            totalCount={result.data.totalCount ?? 0}
            pageSize={searchParams.pageSize}
            page={searchParams.page}
            currentSearch={searchParams}
          />
        </Suspense>
      </div>
    </div>
  )
}
