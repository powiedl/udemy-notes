import {
  createFileRoute,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { noteSearchSchema } from '#/schemas/search-params'
// Achte darauf, dass der Import-Pfad zu deiner getNotesFn stimmt!
import { getNotesFn } from '#/data/note'
import { Suspense, useDeferredValue, useEffect, useState } from 'react'
import { cn } from '#/lib/utils'
import { DataTableSearch } from '#/components/web/data-table-search'
import { DataTablePagination } from '#/components/web/data-table-pagination'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import NotesList from '#/components/web/notes-list'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { AlertCircle } from 'lucide-react'
export const Route = createFileRoute('/_content/notes/')({
  // 1. URL als Source of Truth
  validateSearch: noteSearchSchema,

  // 2. Reactivity: Wenn sich URL-Parameter ändern, triggert der Loader neu
  loaderDeps: ({
    search: { search, page, pageSize, tagIds, sortBy, sortOrder },
  }) => ({
    search,
    page,
    pageSize,
    tagIds,
    sortBy,
    sortOrder,
  }),

  // 3. Server Function Aufruf
  loader: ({ deps }) => {
    return getNotesFn({ data: deps }).catch((error: any) => ({
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : error?.message || 'An unknown error occurred.',
    }))
  },

  component: NotesRouteComponent,
})

function NotesRouteComponent() {
  const searchParams = Route.useSearch()
  const data = Route.useLoaderData()
  const navigate = useNavigate({ from: Route.fullPath })

  // Behalte die "alten" Daten im UI, bis die neuen vom Server da sind
  const deferredData = useDeferredValue(data)

  // Router State für Lade-Indikatoren
  const isLoading = useRouterState({ select: (s) => s.isLoading })
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Nur flackern lassen, wenn der Client gemountet ist (Hydration Mismatch verhindern)
  const isNavigating = mounted && isLoading

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <DataTableSearch
        value={searchParams.search}
        onSearchChange={(val) =>
          navigate({ search: (prev) => ({ ...prev, search: val, page: 1 }) })
        }
      >
        <Select
          value={`${searchParams.sortBy || 'createdAt'}-${searchParams.sortOrder || 'desc'}`}
          onValueChange={(val) => {
            const [sortBy, sortOrder] = val.split('-')
            navigate({
              search: (prev) => ({
                ...prev,
                sortBy: sortBy as any,
                sortOrder: sortOrder as any,
                page: 1,
              }),
            })
          }}
        >
          <SelectTrigger className="w-45">
            <SelectValue placeholder="Sort by..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="course-asc">grouped by course</SelectItem>
            <SelectItem value="createdAt-desc">newest first</SelectItem>
            <SelectItem value="createdAt-asc">oldest first</SelectItem>
          </SelectContent>
        </Select>
      </DataTableSearch>

      {/* Listen-Bereich mit weichem SWR-Fade */}
      <div
        className={cn(
          'transition-opacity duration-200 min-h-125',
          isNavigating ? 'opacity-50' : 'opacity-100',
        )}
      >
        <Suspense fallback={null}>
          {deferredData.success ? (
            <>
              <NotesList
                notes={deferredData.data.items}
                sortBy={searchParams.sortBy}
              />
              <DataTablePagination
                totalCount={deferredData.data.totalCount}
                page={searchParams.page}
                pageSize={searchParams.pageSize}
                currentSearch={searchParams}
              />
            </>
          ) : (
            <Alert variant="destructive" className="my-8">
              <AlertCircle className="size-4" />
              <AlertTitle>Error while loading the notes</AlertTitle>
              <AlertDescription>
                {/* Passe 'error' an den tatsächlichen Key deines Error-Objekts an, z.B. serverError */}
                {'error' in deferredData
                  ? String(deferredData.error)
                  : "Unfortunatly the notes couldn't get loaded"}
              </AlertDescription>
            </Alert>
          )}
        </Suspense>
      </div>
    </div>
  )
}
