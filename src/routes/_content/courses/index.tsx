import { getCoursesFn } from '#/data/course'
import { createFileRoute } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { Suspense, use } from 'react'

export const Route = createFileRoute('/_content/courses/')({
  component: RouteComponent,
  loader: () => ({ coursesPromise: getCoursesFn() }),
  head: () => ({
    meta: [
      {
        title: 'Courses | Udemy Notes',
      },
    ],
  }),
})

function CoursesList({ data }: { data: ReturnType<typeof getCoursesFn> }) {
  const courses = use(data)
  return <p>{courses.length} courses found</p>
}

function RouteComponent() {
  const { coursesPromise } = Route.useLoaderData()

  return (
    <Suspense fallback={<Loader2 className="size-40 animate-spin" />}>
      <CoursesList data={coursesPromise} />
    </Suspense>
  )
}
