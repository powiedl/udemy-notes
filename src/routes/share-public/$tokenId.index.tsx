import { CourseView } from '#/components/web/course-view'
import { getCourseByTokenIdFn, getNotesByTokenIdFn } from '#/data/course-public'
import { cn } from '#/lib/utils'
import { courseNotesSearchSchema } from '#/schemas/search-params'
import { createFileRoute, useRouterState } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { Suspense, use, useDeferredValue, useEffect, useState } from 'react'

export const Route = createFileRoute('/share-public/$tokenId/')({
  component: RouteComponent,
  validateSearch: (search) => courseNotesSearchSchema.parse(search),

  // 2. Den Router reaktiv auf Such-Parameter machen
  loaderDeps: ({ search }) => ({ search }),

  loader: ({ params, deps }) => ({
    coursePromise: getCourseByTokenIdFn({
      data: {
        id: params.tokenId,
        loggingMetadata: {
          component: 'CoursePublicPage',
          actionSource: 'Loader',
        },
      },
    }),
    notesPromise: getNotesByTokenIdFn({
      data: {
        tokenId: params.tokenId,
        searchParams: deps.search,
        loggingMetadata: {
          component: 'CoursePublicPage',
          actionSource: 'Loader',
        },
      },
    }),
    // 3. Parallel die gefilterten/paginierten Notizen laden!
    // notesPromise: getNotesForCourseFn({
    //   data: {
    //     courseId: params.courseId,
    //     searchParams: deps.search,
    //     loggingMetadata: { component: 'CoursePage', actionSource: 'Loader' },
    //   },
    // }),
  }),
  head: () => {
    return {
      meta: [{ title: 'Course Notes - Shared with you' }],
    }
  },
})

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
        'mt-4 px-4 transition-opacity duration-300',
        isNavigating ? 'opacity-50 pointer-events-none' : 'opacity-100',
      )}
    >
      <Suspense fallback={<Loader2 className="size-40 animate-spin mx-auto" />}>
        {/* <ConsoleLog coursePromise={deferredCoursePromise} /> */}
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

function Course({
  coursePromise,
  notesPromise,
  searchParams,
  navigate,
}: {
  coursePromise: ReturnType<typeof getCourseByTokenIdFn>
  notesPromise: ReturnType<typeof getNotesByTokenIdFn>
  searchParams: any
  navigate: any
}) {
  const result = use(coursePromise)
  // const { data: availableTags = [] } = useQuery(tagsQueryOptions)

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
      readOnly={true} // Wir sind hier in der internen Route, also volle Rechte!
      isAdmin={false}
      availableTags={[]}
    />
  )
}
