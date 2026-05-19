import { CourseView } from '#/components/web/course-view'
import { getCourseByIdFn } from '#/data/course'
import { getNotesForCourseFn } from '#/data/note' // NEU
import { useCourseActions } from '#/hooks/use-course-actions.hook'
import { cn } from '#/lib/utils'
import {
  createFileRoute,
  useLoaderData,
  useRouterState,
} from '@tanstack/react-router' // NEU: useRouterState
import { Loader2 } from 'lucide-react'
import { Suspense, use, useDeferredValue, useState, useEffect } from 'react' // NEU: useState, useEffect

// NEUE IMPORTE FÜR DIE SUCHE
import { courseNotesSearchSchema } from '#/schemas/search-params'

import { useQuery } from '@tanstack/react-query'
import { tagsQueryOptions } from '../route'

import { hasRole } from '#/lib/permissions'

export const Route = createFileRoute('/_content/courses/$courseId/')({
  component: RouteComponent,

  // 1. URL validieren und mit Defaults füllen
  validateSearch: (search) => courseNotesSearchSchema.parse(search),

  // 2. Den Router reaktiv auf Such-Parameter machen
  loaderDeps: ({ search }) => ({ search }),

  loader: ({ params, deps }) => ({
    coursePromise: getCourseByIdFn({
      data: {
        id: params.courseId,
        loggingMetadata: { component: 'CoursePage', actionSource: 'Loader' },
      },
    }),
    // 3. Parallel die gefilterten/paginierten Notizen laden!
    notesPromise: getNotesForCourseFn({
      data: {
        courseId: params.courseId,
        searchParams: deps.search,
        loggingMetadata: { component: 'CoursePage', actionSource: 'Loader' },
      },
    }),
  }),
  head: () => {
    return {
      meta: [{ title: 'Course Details' }],
    }
  },
})

// === ROUTE COMPONENT (Die flackerfreie Hülle) ===
function RouteComponent() {
  const { coursePromise, notesPromise } = Route.useLoaderData()
  const searchParams = Route.useSearch()
  const navigate = Route.useNavigate()

  const deferredCoursePromise = useDeferredValue(coursePromise)
  const deferredNotesPromise = useDeferredValue(notesPromise)

  // Hydration-sicheres "Ausgrauen" während der Suche
  const pending = useRouterState({ select: (s) => s.status === 'pending' })
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  const isNavigating = mounted && pending

  return (
    <div
      className={cn(
        'px-4 transition-opacity duration-300',
        isNavigating ? 'opacity-50 pointer-events-none' : 'opacity-100',
      )}
    >
      <Suspense fallback={<Loader2 className="size-40 animate-spin mx-auto" />}>
        <Course
          coursePromise={deferredCoursePromise}
          notesPromise={deferredNotesPromise}
          searchParams={searchParams}
          navigate={navigate}
        />
      </Suspense>
    </div>
  )
}

// === KURS RESOLVER ===
function Course({
  coursePromise,
  notesPromise,
  searchParams,
  navigate,
}: {
  coursePromise: ReturnType<typeof getCourseByIdFn>
  notesPromise: ReturnType<typeof getNotesForCourseFn>
  searchParams: any
  navigate: any
}) {
  const result = use(coursePromise)
  const { handleExport, handleDelete, handleShare } = useCourseActions()
  const { user } = useLoaderData({ from: '/_content' })
  const isAdmin = hasRole(user, 'admin')
  const { data: availableTags = [] } = useQuery(tagsQueryOptions)

  if (!result.success)
    return (
      <div className="p-4 border border-red-500 bg-red-50 text-red-700 rounded">
        <p>Error while loading the course</p>
        <pre>{result.error}</pre>
      </div>
    )

  const course = result.data

  return (
    <CourseView
      course={course}
      notesPromise={notesPromise}
      searchParams={searchParams}
      navigate={navigate}
      readOnly={false} // Wir sind hier in der internen Route, also volle Rechte!
      isAdmin={isAdmin}
      availableTags={availableTags}
      onExport={(data) => handleExport(data)}
      onDelete={() => handleDelete(course.id)}
      onShare={() => handleShare(course.id)}
    />
  )
}

// === KURS INHALT (Header + Suchleiste + Notizen) ===
// function CourseContent({ course, notesPromise, searchParams, navigate }: any) {
//   const { handleExport, handleDelete, handleShare } = useCourseActions()
//   const { user } = useLoaderData({ from: '/_content' })
//   const isAdmin = hasRole(user, 'admin')

//   // 1. Tag-Daten und UI-States
//   const { data: availableTags = [] } = useQuery(tagsQueryOptions)

//   // Wir extrahieren die IDs aller Tags, die bereits am Kurs hängen
//   const courseTagIds = course.tags?.map((t: any) => t.tag.id) || []

//   // Das Dropdown darf nur Tags anzeigen, die NICHT schon Kurs-Tags sind
//   const filterableTags = availableTags.filter(
//     (tag: any) => !courseTagIds.includes(tag.id),
//   )

//   const [isFilterOpen, setIsFilterOpen] = useState(false)

//   // Sicheres Fallback, falls tagIds in der URL noch nicht existiert
//   const tagIds = searchParams.tagIds || []

//   // 2. Toggle-Logik für die Tags
//   const toggleTag = (tagId: string) => {
//     const isActive = tagIds.includes(tagId)
//     const newTags = isActive
//       ? tagIds.filter((id: string) => id !== tagId)
//       : [...tagIds, tagId]

//     navigate({
//       search: (prev: any) => ({
//         ...prev,
//         tagIds: newTags.length > 0 ? newTags : undefined,
//         page: 1, // Bei neuem Filter immer auf Seite 1 springen!
//       }),
//       replace: true,
//     })
//   }

//   const title =
//     course.title?.trim() !== 'Course Details'
//       ? `${course.title} | Udemy Notes`
//       : 'Course Details | Udemy-Notes'

//   return (
//     <>
//       <title>{title}</title>

//       {/* --- SUCHLEISTE & TAG-FILTER --- */}
//       <div className="mb-4 flex flex-col gap-4">
//         <DataTableSearch
//           value={searchParams.search}
//           placeholder="Search in sections, lectures, or content..."
//           onSearchChange={(text) => {
//             navigate({
//               search: (prev: any) => ({ ...prev, search: text, page: 1 }),
//               replace: true,
//             })
//           }}
//         >
//           {/* Das Popover als Child der Suchleiste */}
//           <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
//             <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
//               <PopoverTrigger asChild>
//                 <Button
//                   variant="outline"
//                   className="h-10 border-dashed px-2 sm:px-4"
//                 >
//                   <TagIcon className="mr-1 sm:mr-2 h-4 w-4" />
//                   <span className="hidden sm:inline">Tags</span>
//                   {tagIds.length > 0 && (
//                     <>
//                       <div className="mx-1 sm:mx-2 h-4 w-px bg-border" />
//                       <Badge
//                         variant="secondary"
//                         className="rounded-sm px-1 font-normal"
//                       >
//                         {tagIds.length}
//                       </Badge>
//                     </>
//                   )}
//                 </Button>
//               </PopoverTrigger>
//               <PopoverContent className="w-50 p-0" align="end">
//                 <Command>
//                   <CommandInput placeholder="Filter tags..." />
//                   <CommandList>
//                     <CommandEmpty>No tags found.</CommandEmpty>
//                     <CommandGroup>
//                       {filterableTags.map((tag: any) => {
//                         const isSelected = tagIds.includes(tag.id)
//                         return (
//                           <CommandItem
//                             key={tag.id}
//                             onSelect={() => toggleTag(tag.id)}
//                           >
//                             <div
//                               className={cn(
//                                 'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
//                                 isSelected
//                                   ? 'bg-primary text-primary-foreground'
//                                   : 'opacity-50',
//                               )}
//                             >
//                               {isSelected && <Check className="h-3 w-3" />}
//                             </div>
//                             <span>{tag.name}</span>
//                           </CommandItem>
//                         )
//                       })}
//                     </CommandGroup>
//                   </CommandList>
//                 </Command>
//               </PopoverContent>
//             </Popover>
//           </div>
//         </DataTableSearch>

//         {/* --- AKTIVE FILTER (Die leuchtenden Badges) --- */}
//         {tagIds.length > 0 && (
//           <div className="flex flex-wrap items-center gap-2">
//             <span className="text-xs font-medium text-muted-foreground mr-1">
//               Active filters:
//             </span>

//             {/* HYDRATION FIX: Wir mappen direkt über die stabilen tagIds aus der URL */}
//             {tagIds.map((id: string) => {
//               const tag = availableTags.find((t: any) => t.id === id)

//               return (
//                 <Badge
//                   key={id}
//                   variant="secondary"
//                   className="pl-2 pr-1 py-1 gap-1"
//                 >
//                   {/* Solange 'availableTags' im Client noch lädt, zeigen wir einen kleinen Skeleton-Platzhalter */}
//                   {tag ? (
//                     tag.name
//                   ) : (
//                     <span className="w-8 h-3 animate-pulse bg-muted-foreground/20 rounded-full inline-block" />
//                   )}
//                   <button
//                     onClick={() => toggleTag(id)}
//                     className="hover:bg-muted rounded-full p-0.5"
//                   >
//                     <X className="h-3 w-3" />
//                   </button>
//                 </Badge>
//               )
//             })}

//             <Button
//               variant="ghost"
//               size="sm"
//               onClick={() =>
//                 navigate({
//                   // Wir setzen tagIds auf undefined, um es sauber aus der URL zu löschen
//                   search: (prev: any) => ({
//                     ...prev,
//                     tagIds: undefined,
//                     page: 1,
//                   }),
//                 })
//               }
//               className="h-8 px-2 text-xs text-destructive hover:text-destructive"
//             >
//               Clear all
//             </Button>
//           </div>
//         )}
//       </div>

//       <Card>
//         <CardHeader>
//           <CourseHeader
//             course={course}
//             isAdmin={isAdmin}
//             onExport={(data) => handleExport(data)}
//             onDelete={() => handleDelete(course.id)}
//             onShare={() => handleShare(course.id)}
//           />
//         </CardHeader>
//         <CardContent>
//           <Suspense
//             fallback={
//               <div className="py-10 flex justify-center">
//                 <Loader2 className="size-8 animate-spin text-muted-foreground" />
//               </div>
//             }
//           >
//             <AsyncNotesList
//               notesPromise={notesPromise}
//               currentSearch={searchParams}
//             />
//           </Suspense>
//         </CardContent>
//       </Card>
//     </>
//   )
// }

// === NOTIZ RESOLVER & RENDERER ===
// function AsyncNotesList({
//   notesPromise,
//   currentSearch,
// }: {
//   notesPromise: ReturnType<typeof getNotesForCourseFn>
//   currentSearch: any
// }) {
//   const result = use(notesPromise)

//   if (!result.success) {
//     return (
//       <div className="text-red-500">Error loading notes: {result.error}</div>
//     )
//   }

//   const { items, totalCount } = result.data

//   return (
//     <div className="space-y-4">
//       {/* ACHTUNG: Ich übergebe hier 'items' an deine NotesList.
//         Falls deine NotesList erwartet, dass die Notizen genau wie vorher strukturiert sind,
//         sollte das nahtlos passen!
//       */}
//       <NotesList notes={items} from="courses" />

//       <DataTablePagination
//         totalCount={totalCount}
//         pageSize={currentSearch.pageSize}
//         page={currentSearch.page}
//         currentSearch={currentSearch}
//       />
//     </div>
//   )
// }
