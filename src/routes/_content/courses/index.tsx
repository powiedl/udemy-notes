import CourseHeader from '#/components/web/course-header'
import { DataTablePagination } from '#/components/web/data-table-pagination'
import { DataTableSearch } from '#/components/web/data-table-search'
import { getCoursesFn } from '#/data/course'
import { useCourseActions } from '#/hooks/use-course-actions'
import { cn } from '#/lib/utils'
import { paginationSchema } from '#/schemas/search-params'
import { createFileRoute, useRouterState } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { Suspense, use, useDeferredValue, useEffect, useState } from 'react'

export const Route = createFileRoute('/_content/courses/')({
  component: RouteComponent,
  validateSearch: (search) => paginationSchema.parse(search),
  // Hier definieren wir, von welchen Parametern der Loader abhängt
  loaderDeps: ({ search }) => ({ search }),
  staleTime: 60000,
  loader: ({ deps }) => {
    // deps ist hier das Objekt, das loaderDeps zurückgegeben hat.
    // Also: { search: { page, pageSize, search } }
    return {
      coursesPromise: getCoursesFn({
        data: { ...deps.search, loggingMetadata: { component: 'CoursesPage' } },
      }),
    }
  },
  // E. (Optional) Eine Pending-Component für das ALLERERSTE Laden
  pendingComponent: () => (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="animate-spin size-12 text-primary" />
    </div>
  ),
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
}: {
  data: ReturnType<typeof getCoursesFn>
  page: number
  pageSize: number
}) {
  const result = use(data)
  if (!result.success) return <div>Fehler: {result.error}</div>
  const searchParams = Route.useSearch()
  const { handleExport, handleDelete } = useCourseActions()
  // Wir extrahieren Items und totalCount aus deinem neuen Server-Response-Format
  const { items: courses, totalCount } = result.data

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
        {courses.map((course) => (
          <CourseHeader
            course={course}
            singleCourse={false}
            key={course.id}
            onExport={() => handleExport(course.id)}
            onDelete={() => handleDelete(course.id)}
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

function RouteComponent() {
  const { coursesPromise } = Route.useLoaderData()
  const searchParams = Route.useSearch()
  const navigate = Route.useNavigate()

  // Hier passiert die Magie:
  // deferredPromise hinkt dem eigentlichen coursesPromise hinterher.
  // React behält das alte Promise so lange "aktiv", bis das neue aufgelöst ist.
  const deferredPromise = useDeferredValue(coursesPromise)

  // Status-Check
  const pending = useRouterState({ select: (s) => s.status === 'pending' })

  // Hydration-Schutz:
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
            replace: true,
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
          {/* WICHTIG: Wir übergeben das DEFERRED Promise.
            Dadurch "suspensed" diese Komponente nicht sofort, 
            sondern zeigt die alten Daten (die durch das div oben 
            ausgegraut sind), bis die neuen Daten bereit sind.
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
