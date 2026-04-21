import { DataTablePagination } from '#/components/web/data-table-pagination'
import { DataTableSearch } from '#/components/web/data-table-search'
import TagBadge from '#/components/web/tag-badge'
import { deleteTagFn, getAvailableTagsFn } from '#/data/tag'
import { handleAction } from '#/lib/client-utils'
import { cn } from '#/lib/utils'
import { ClientLoggingMetadata } from '#/schemas/api-utils'
import {
  COURSE_SEARCH_DEFAULTS,
  NOTE_SEARCH_DEFAULTS,
  tagPaginationSchema,
} from '#/schemas/search-params'
import {
  createFileRoute,
  Link,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Info, Loader2 } from 'lucide-react'
import {
  Suspense,
  use,
  useDeferredValue,
  useEffect,
  useState,
  useTransition,
} from 'react'

export const Route = createFileRoute('/_content/tags/')({
  component: RouteComponent,
  validateSearch: (search) => tagPaginationSchema.parse(search),
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ deps }) => ({
    tagsPromise: getAvailableTagsFn({ data: deps.search }),
  }),
})

function Tags({ data }: { data: ReturnType<typeof getAvailableTagsFn> }) {
  const router = useRouter()
  const result = use(data)
  const deleteTag = useServerFn(deleteTagFn)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [_, startDeleteTransition] = useTransition()
  // Logging information für diese Komponente
  const loggingMetadata: ClientLoggingMetadata = {
    component: 'Tags', // Der Name der Komponente
    actionSource: 'Tag-Badge, X-Button',
    feature: 'DeleteTag', // Optional: Spezifische Aktion
  }
  const handleDeleteTag = async (id: string) => {
    setDeletingId(id)
    startDeleteTransition(async () => {
      try {
        await handleAction(deleteTag({ data: { id, loggingMetadata } }), {
          successToast: 'Tag deleted successfully',
        })
        router.invalidate()
      } catch (error) {
        // Fehler wurde bereits durch handleAction via Toast gemeldet
      } finally {
        setDeletingId(null)
      }
    })
  }

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
        <TagBadge
          key={t.id}
          tag={t}
          onDelete={t.userId ? () => handleDeleteTag(t.id) : undefined}
          isDeleting={deletingId === t.id}
        />
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
      <div>
        <span className="flex items-center text-lg">
          <Info className="size-5 mr-1" />
          Tags
        </span>
        <p className="text-muted-foreground">
          Here you can search for all tags and delete your private ones. To add
          a new tag simply use the assign Button in{' '}
          <Link to="/courses" search={COURSE_SEARCH_DEFAULTS}>
            Courses
          </Link>{' '}
          or{' '}
          <Link to="/notes" search={NOTE_SEARCH_DEFAULTS}>
            Notes
          </Link>
          .
        </p>
      </div>
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
