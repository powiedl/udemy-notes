import { DataTablePagination } from '#/components/web/data-table-pagination'
import { DataTableSearch } from '#/components/web/data-table-search'
import TagBadge from '#/components/web/tag-badge'
import { Button } from '#/components/ui/button' // NEU: Button Import für das Modal
import {
  deleteTagFn,
  getAvailableTagsFn,
  renameTagFn,
  getTagUsageCountFn, // NEU: Statistik-Funktion
} from '#/data/tag'
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
import { Info, Loader2, AlertTriangle } from 'lucide-react' // NEU: AlertTriangle
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

  // Server Functions
  const deleteTag = useServerFn(deleteTagFn)
  const renameTag = useServerFn(renameTagFn)
  const getTagUsage = useServerFn(getTagUsageCountFn) // NEU

  // UI State
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Modal State
  const [deleteCandidate, setDeleteCandidate] = useState<{
    id: string
    name: string
  } | null>(null)
  const [usageStats, setUsageStats] = useState<{
    courses: number
    notes: number
  } | null>(null)
  const [isFetchingStats, setIsFetchingStats] = useState(false)

  const [_, startDeleteTransition] = useTransition()

  const loggingMetadata: ClientLoggingMetadata = {
    component: 'Tags',
    actionSource: 'Tag-Badge',
    feature: 'TagManagement',
  }

  // 1. Modal öffnen und Daten laden
  const initiateDelete = async (tag: { id: string; name: string }) => {
    setDeleteCandidate(tag)
    setIsFetchingStats(true)
    try {
      const res = await getTagUsage({ data: { id: tag.id } })
      // Wir prüfen das typische ActionResponse-Format
      if (res.success && res.data) {
        setUsageStats(res.data)
      } else {
        setUsageStats({ courses: 0, notes: 0 })
      }
    } catch (error) {
      setUsageStats({ courses: 0, notes: 0 }) // Fallback bei Netzwerkfehler
    } finally {
      setIsFetchingStats(false)
    }
  }

  // 2. Bestätigtes Löschen via Modal
  const confirmDelete = async () => {
    if (!deleteCandidate) return
    const id = deleteCandidate.id

    setDeletingId(id) // Wir nutzen deinen bestehenden State!
    startDeleteTransition(async () => {
      try {
        const success = await handleAction(
          deleteTag({ data: { id, loggingMetadata } }),
          {
            successToast: 'Tag deleted successfully',
          },
        )

        if (success) {
          setDeleteCandidate(null)
          setUsageStats(null)
          router.invalidate()
        }
      } catch (error) {
        // Fehler wird durch handleAction gemeldet
      } finally {
        setDeletingId(null) // Reset auch bei Fehler
      }
    })
  }

  // 3. Löschen abbrechen
  const cancelDelete = () => {
    setDeleteCandidate(null)
    setUsageStats(null)
  }

  const handleRenameTag = async (id: string, newName: string) => {
    if (!result.success) return
    const originalTag = result.data.items.find((t) => t.id === id)

    if (!newName.trim() || newName === originalTag?.name) {
      setEditingId(null)
      return
    }

    const success = await handleAction(
      renameTag({ data: { id, newName: newName.trim() } }),
      { successToast: 'Tag renamed successfully' },
    )

    if (success) {
      setEditingId(null)
      router.invalidate()
    }
  }

  if (!result.success)
    return (
      <div className="p-4 border border-red-500 bg-red-50 text-red-700 rounded">
        <p>Error while loading the tags</p>
        <pre>{result.error}</pre>
      </div>
    )

  const tags = result.data

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {tags.items.map((t) => (
          <TagBadge
            key={t.id}
            tag={t}
            // Trigger das Modal statt direktem Löschen
            onDelete={t.userId ? () => initiateDelete(t) : undefined}
            isDeleting={deletingId === t.id}
            isEditing={editingId === t.id}
            onStartEdit={() => setEditingId(t.id)}
            onCancelEdit={() => setEditingId(null)}
            onRename={(newName) => handleRenameTag(t.id, newName)}
          />
        ))}
      </div>

      {/* Das Lösch-Bestätigungs-Modal */}
      {deleteCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/25 backdrop-blur-xs p-4">
          <div className="bg-card border text-card-foreground shadow-lg rounded-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4 text-destructive">
              <AlertTriangle className="size-6" />
              <h2 className="text-lg font-semibold">Delete Tag?</h2>
            </div>

            <p className="text-muted-foreground mb-4">
              Are you sure you want to delete the tag{' '}
              <strong className="text-foreground uppercase">
                {deleteCandidate.name}
              </strong>
              ?
            </p>

            <div className="bg-muted/50 rounded-lg p-4 mb-6 min-h-18 flex items-center justify-center">
              {isFetchingStats ? (
                <Loader2 className="animate-spin size-5 text-muted-foreground" />
              ) : usageStats ? (
                <div className="text-sm text-center">
                  This tag will be removed from:
                  <br />
                  <strong className="text-foreground">
                    {usageStats.courses}
                  </strong>{' '}
                  Courses and{' '}
                  <strong className="text-foreground">
                    {usageStats.notes}
                  </strong>{' '}
                  Notes.
                </div>
              ) : null}
            </div>

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={cancelDelete}
                disabled={deletingId === deleteCandidate.id}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDelete}
                disabled={isFetchingStats || deletingId === deleteCandidate.id}
              >
                {deletingId === deleteCandidate.id && (
                  <Loader2 className="animate-spin size-4 mr-2" />
                )}
                Delete Tag
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function RouteComponent() {
  const { tagsPromise } = Route.useLoaderData()
  const searchParams = Route.useSearch()
  const navigate = Route.useNavigate()
  const deferredPromise = useDeferredValue(tagsPromise)

  const pending = useRouterState({ select: (s) => s.status === 'pending' })

  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

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
          Here you can search for all tags and rename (simply click on the tag)
          or delete (click on the X to the right of the tag) your private ones.
          To add a new tag simply use the assign Button in{' '}
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
          <Tags data={deferredPromise} />
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
