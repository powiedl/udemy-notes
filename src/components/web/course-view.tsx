// src/components/web/course-view.tsx
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import CourseHeader from '#/components/web/course-header'
import NotesList from '#/components/web/notes-list'
import { DataTableSearch } from '#/components/web/data-table-search'
import { DataTablePagination } from '#/components/web/data-table-pagination'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '#/components/ui/command'
import { Check, Loader2, Tag as TagIcon, X } from 'lucide-react'
import { Suspense, use, useState } from 'react'
import { cn } from '#/lib/utils'
import type { ExportMdFileSchema } from '#/schemas/export-file'
import type { getNotesForCourseFn } from '#/data/note'

// Wir definieren strikt, was die Komponente von der Route braucht
export interface CourseViewProps {
  course: any
  notesPromise: ReturnType<typeof getNotesForCourseFn>
  searchParams: any
  navigate: any
  readOnly?: boolean

  isAdmin?: boolean
  availableTags?: any[] // Für das Filter-Dropdown
  onExport?: (data: ExportMdFileSchema) => void
  onDelete?: (id: string) => void
  onShare?: (id: string) => void
}

export function CourseView({
  course,
  notesPromise,
  searchParams,
  navigate,
  readOnly = false,
  isAdmin = false,
  availableTags = [],
  onExport,
  onDelete,
  onShare,
}: CourseViewProps) {
  const courseTagIds = course.tags?.map((t: any) => t.tag.id) || []

  // Im ReadOnly-Modus zeigen wir im Filter nur die Tags an, die der Kurs ohnehin hat.
  // Im internen Modus zeigen wir alle an, die der Kurs noch NICHT hat.
  const filterableTags = readOnly
    ? course.tags?.map((t: any) => t.tag) || []
    : availableTags.filter((tag: any) => !courseTagIds.includes(tag.id))

  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const tagIds = searchParams.tagIds || []

  const toggleTag = (tagId: string) => {
    const isActive = tagIds.includes(tagId)
    const newTags = isActive
      ? tagIds.filter((id: string) => id !== tagId)
      : [...tagIds, tagId]

    navigate({
      search: (prev: any) => ({
        ...prev,
        tagIds: newTags.length > 0 ? newTags : undefined,
        page: 1,
      }),
      replace: true,
    })
  }

  const title =
    course.title?.trim() !== 'Course Details'
      ? `${course.title} | Udemy Notes`
      : 'Course Details | Udemy-Notes'

  // WICHTIG: Wenn wir readOnly sind, holen wir die Tag-Namen der aktiven Filter
  // direkt aus dem Kurs, da wir "availableTags" (die globale Liste) nicht haben.
  const getTagForBadge = (id: string) => {
    if (readOnly) return course.tags?.find((t: any) => t.tag.id === id)?.tag
    return availableTags.find((t: any) => t.id === id)
  }

  return (
    <>
      <title>{title}</title>

      <div className="mb-4 flex flex-col gap-4">
        <DataTableSearch
          value={searchParams.search}
          placeholder="Search in sections, lectures, or content..."
          onSearchChange={(text) => {
            navigate({
              search: (prev: any) => ({ ...prev, search: text, page: 1 }),
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
                      {filterableTags.map((tag: any) => {
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

        {tagIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground mr-1">
              Active filters:
            </span>
            {tagIds.map((id: string) => {
              const tag = getTagForBadge(id)
              return (
                <Badge
                  key={id}
                  variant="secondary"
                  className="pl-2 pr-1 py-1 gap-1"
                >
                  {tag ? (
                    tag.name
                  ) : (
                    <span className="w-8 h-3 animate-pulse bg-muted-foreground/20 rounded-full inline-block" />
                  )}
                  <button
                    onClick={() => toggleTag(id)}
                    className="hover:bg-muted rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )
            })}
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                navigate({
                  search: (prev: any) => ({
                    ...prev,
                    tagIds: undefined,
                    page: 1,
                  }),
                })
              }
              className="h-8 px-2 text-xs text-destructive hover:text-destructive"
            >
              Clear all
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CourseHeader
            course={course}
            isAdmin={isAdmin}
            // Wir geben readOnly weiter (muss in CourseHeader noch implementiert werden)
            readOnly={readOnly}
            // Callbacks nur übergeben, wenn wir nicht readOnly sind
            onExport={readOnly ? undefined : onExport}
            onDelete={readOnly ? undefined : onDelete}
            onShare={readOnly ? undefined : onShare}
          />
        </CardHeader>
        <CardContent>
          <Suspense
            fallback={
              <div className="py-10 flex justify-center">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <AsyncNotesList
              notesPromise={notesPromise}
              currentSearch={searchParams}
              readOnly={readOnly} // Auch hier weitergeben!
            />
          </Suspense>
        </CardContent>
      </Card>
    </>
  )
}

function AsyncNotesList({
  notesPromise,
  currentSearch,
  readOnly,
}: {
  notesPromise: ReturnType<typeof getNotesForCourseFn>
  currentSearch: any
  readOnly: boolean
}) {
  const result = use(notesPromise)
  if (!result.success)
    return (
      <div className="text-red-500">Error loading notes: {result.error}</div>
    )

  const { items, totalCount } = result.data

  return (
    <div className="space-y-4">
      <NotesList notes={items} from="courses" readOnly={readOnly} />
      <DataTablePagination
        totalCount={totalCount}
        pageSize={currentSearch.pageSize}
        page={currentSearch.page}
        currentSearch={currentSearch}
      />
    </div>
  )
}
