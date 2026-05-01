import {
  createFileRoute,
  getRouteApi,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { noteSearchSchema } from '#/schemas/search-params'
// Achte darauf, dass der Import-Pfad zu deiner getNotesFn stimmt!
import { getNotesFn } from '#/data/note'
import { Check, Tag as TagIcon, X, AlertCircle } from 'lucide-react'
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
// UI-Komponenten von shadcn
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import NotesList from '#/components/web/notes-list'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'

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

const layoutRouteApi = getRouteApi('/_content')

function NotesRouteComponent() {
  const { tagIds, ...searchParams } = Route.useSearch()
  const data = Route.useLoaderData()
  const navigate = useNavigate({ from: Route.fullPath })
  const { availableTags } = layoutRouteApi.useLoaderData()
  const [isFilterOpen, setIsFilterOpen] = useState(false)

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

  // Helper zum Umschalten der Tags in der URL
  const toggleTag = (id: string) => {
    const nextTags = tagIds.includes(id)
      ? tagIds.filter((t) => t !== id)
      : [...tagIds, id]

    navigate({
      search: (prev) => ({
        ...prev,
        tagIds: nextTags,
        page: 1, // Reset auf Seite 1 bei Filteränderung
      }),
    })
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      {/* Such- & Filter-Bar */}
      <div className="flex flex-col gap-4">
        <DataTableSearch
          value={searchParams.search}
          onSearchChange={(val) =>
            navigate({ search: (prev) => ({ ...prev, search: val, page: 1 }) })
          }
        >
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {/* TAG FILTER POPOVER (Neu) */}
            <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-10 border-dashed">
                  <TagIcon className="mr-0.5 h-4 w-4" />
                  <span className="hidden lg:inline">Tags</span>
                  {tagIds.length > 0 && (
                    <>
                      <div className="mx-0.5 h-4 w-px bg-border" />
                      <Badge
                        variant="secondary"
                        className="rounded-sm px-0.5 font-normal"
                      >
                        {tagIds.length}
                      </Badge>
                    </>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-50 p-0" align="end">
                <Command>
                  <CommandInput placeholder="Filter tags..." />
                  <CommandList>
                    <CommandEmpty>No tags found</CommandEmpty>
                    <CommandGroup>
                      {availableTags.map((tag) => {
                        const isSelected = tagIds.includes(tag.id)
                        return (
                          <CommandItem
                            key={tag.id}
                            onSelect={() => toggleTag(tag.id)}
                          >
                            <div
                              className={cn(
                                'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                                isSelected
                                  ? 'bg-primary text-primary-foreground'
                                  : 'opacity-50',
                              )}
                            >
                              {isSelected && <Check className="h-3 w-3" />}
                            </div>
                            <span>{tag.name}</span>
                          </CommandItem>
                        )
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {/* Bestehender Sort-Select */}
            <Select
              value={`${searchParams.sortBy}-${searchParams.sortOrder}`}
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
          </div>
        </DataTableSearch>

        {/* AKTIVE FILTER BADGES (Neu) */}
        {tagIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground mr-1">
              Active filters:
            </span>
            {availableTags
              .filter((t) => tagIds.includes(t.id))
              .map((tag) => (
                <Badge
                  key={tag.id}
                  variant="secondary"
                  className="pl-2 pr-1 py-1 gap-1"
                >
                  {tag.name}
                  <button
                    onClick={() => toggleTag(tag.id)}
                    className="hover:bg-muted rounded-full p-0.5 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                navigate({
                  search: (prev) => ({ ...prev, tagIds: [], page: 1 }),
                })
              }
              className="h-8 px-2 text-xs text-destructive hover:text-destructive"
            >
              Clear all
            </Button>
          </div>
        )}
      </div>

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
                activeTagIds={tagIds}
                from="notes"
              />
              <DataTablePagination
                totalCount={deferredData.data.totalCount}
                page={searchParams.page}
                pageSize={searchParams.pageSize}
                currentSearch={{ ...searchParams, tagIds }}
              />
            </>
          ) : (
            <Alert variant="destructive" className="my-8">
              <AlertCircle className="size-4" />
              <AlertTitle>Error while loading the notes</AlertTitle>
              <AlertDescription>
                {'error' in deferredData
                  ? String(deferredData.error)
                  : "Unfortunately the notes couldn't be loaded"}
              </AlertDescription>
            </Alert>
          )}
        </Suspense>
      </div>
    </div>
  )
}
