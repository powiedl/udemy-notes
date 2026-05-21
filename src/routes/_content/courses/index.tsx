import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '#/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import CourseHeader from '#/components/web/course-header'
import { DataTablePagination } from '#/components/web/data-table-pagination'
import { DataTableSearch } from '#/components/web/data-table-search'
import { getCoursesFn } from '#/data/course.data'
import { useCourseActions } from '#/hooks/use-course-actions.hook'
import { hasRole } from '#/lib/permissions.lib'
import { cn } from '#/lib/utils.lib'
import { courseSearchSchema } from '#/schemas/search-params.schema'
import type { ActionResponse, ServerFnData } from '#/types/api.type'
import {
  createFileRoute,
  getRouteApi,
  Link,
  useLoaderData,
  useRouterState,
} from '@tanstack/react-router'
import { CommandEmpty } from 'cmdk'
import { Check, TagIcon, X } from 'lucide-react'
import { Suspense, use, useDeferredValue, useEffect, useState } from 'react'

export const Route = createFileRoute('/_content/courses/')({
  component: RouteComponent,
  validateSearch: courseSearchSchema,
  // Hier definieren wir, von welchen Parametern der Loader abhängt
  loaderDeps: ({ search: { search, page, pageSize, tagIds, trainer } }) => ({
    search,
    page,
    pageSize,
    tagIds,
    trainer,
  }),
  staleTime: 60000,
  loader: ({ deps }) => {
    // deps ist hier das Objekt, das loaderDeps zurückgegeben hat.
    // Also: { search: { page, pageSize, search } }
    return {
      coursesPromise: getCoursesFn({
        data: {
          ...deps,
          loggingMetadata: { component: 'CoursesPage' },
        },
      }),
    }
  },
  head: () => ({
    meta: [
      {
        title: 'Courses | Udemy Notes',
      },
    ],
  }),
})

function CoursesList({
  data,
  page,
  pageSize,
  search,
  trainer,
}: {
  data: Promise<ActionResponse<ServerFnData<typeof getCoursesFn>>>
  page: number
  pageSize: number
  search?: string
  trainer?: string
}) {
  const result = use(data) // Das Promise wird hier aufgelöst
  const { user } = useLoaderData({ from: '/_content' })
  const isAdmin = hasRole(user, 'admin')

  if (!result.success) {
    return (
      <div className="p-4 text-destructive bg-destructive/10 rounded-md">
        Error while loading courses: {result.error}
      </div>
    )
  }

  const { items: courses, totalCount } = result.data
  const { handleExport, handleDelete, handleShare } = useCourseActions()
  const searchParams = Route.useSearch() // searchParams für DataTablePagination

  if (totalCount === 0) {
    return (
      <div className="p-4 text-center">
        {!search && !trainer ? (
          <>
            "You don't have any courses yet.&nbsp;""
            <Link to="/courses/import" className="text-primary hover:underline">
              Start by importing your first course
            </Link>
          </>
        ) : (
          'No courses match your search criteria'
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {courses.map((course) => (
          <CourseHeader
            isAdmin={isAdmin}
            course={course}
            singleCourse={false}
            key={course.id}
            onExport={(exportData) => handleExport(exportData)}
            onDelete={() => handleDelete(course.id)}
            className="min-w-0"
            activeTagIds={searchParams.tagIds}
            onShare={() => handleShare(course.id)}
          />
        ))}
      </div>

      {/* Pagination erscheint erst, wenn Daten da sind */}
      <DataTablePagination
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        currentSearch={searchParams}
      />
    </div>
  )
}

const layoutRouteApi = getRouteApi('/_content')
function RouteComponent() {
  const { coursesPromise } = Route.useLoaderData()
  const searchParams = Route.useSearch()
  const navigate = Route.useNavigate()
  const { availableTags } = layoutRouteApi.useLoaderData() // Globale Tags laden

  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const deferredPromise = useDeferredValue(coursesPromise)
  const pending = useRouterState({ select: (s) => s.status === 'pending' })
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isNavigating = mounted && pending
  const tagIds = searchParams.tagIds

  // Helper zum Setzen der URL-Parameter
  const toggleTag = (id: string) => {
    const nextTags = tagIds.includes(id)
      ? tagIds.filter((t) => t !== id)
      : [...tagIds, id]

    navigate({
      search: (prev) => ({
        ...prev,
        tagIds: nextTags,
        page: 1, // Immer auf Seite 1 springen bei neuem Filter
      }),
      replace: true,
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        {/* --- SUCHLEISTE & DROPDOWN --- */}
        <DataTableSearch
          value={searchParams.search}
          onSearchChange={(text) => {
            navigate({
              search: (prev) => ({ ...prev, search: text, page: 1 }),
              replace: true,
            })
          }}
        >
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-10 border-dashed px-2 sm:px-4"
                >
                  <TagIcon className="mr-1 sm:mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">Tags</span>
                  {tagIds.length > 0 && (
                    <>
                      <div className="mx-1 sm:mx-2 h-4 w-px bg-border" />
                      <Badge
                        variant="secondary"
                        className="rounded-sm px-1 font-normal"
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
                    <CommandEmpty>No tags found.</CommandEmpty>
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
          </div>
        </DataTableSearch>

        {/* --- AKTIVE FILTER (Die leuchtenden Badges) --- */}
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
                    className="hover:bg-muted rounded-full p-0.5"
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

      <div
        className={cn(
          'transition-opacity duration-300',
          isNavigating ? 'opacity-50 pointer-events-none' : 'opacity-100',
        )}
      >
        <Suspense fallback={null}>
          <CoursesList
            data={deferredPromise}
            page={searchParams.page}
            pageSize={searchParams.pageSize}
            search={searchParams.search}
            trainer={searchParams.trainer}
          />
        </Suspense>
      </div>
    </div>
  )
}
