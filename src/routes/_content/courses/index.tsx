import { buttonVariants } from '#/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#/components/ui/empty'
import CourseHeader from '#/components/web/course-header'
import { getCoursesFn } from '#/data/course'
import {
  handleDeleteCourse,
  handleExportCourse,
} from '#/handlers/course-header'
import { cn } from '#/lib/utils'
import { createFileRoute, Link } from '@tanstack/react-router'
import { BookOpenText, Loader2, UploadCloud } from 'lucide-react'
import { Suspense, use } from 'react'

export const Route = createFileRoute('/_content/courses/')({
  component: RouteComponent,
  loader: () => ({ coursesPromise: getCoursesFn({}) }),
  head: () => ({
    meta: [
      {
        title: 'Courses | Udemy Notes',
      },
    ],
  }),
})

function CoursesList({ data }: { data: ReturnType<typeof getCoursesFn> }) {
  const result = use(data)
  if (!result.success)
    return (
      <div className="p-4 border border-red-500 bg-red-50 text-red-700 rounded">
        <p>Error while loading the courses ...</p>
        <pre>{result.error}</pre>
      </div>
    )
  const courses = result.data
  if (!courses)
    return (
      <Empty className="border rounded-lg h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BookOpenText className="size-12" />
          </EmptyMedia>
          <EmptyTitle>No courses imported yet</EmptyTitle>
        </EmptyHeader>
        <EmptyDescription>
          Import a course to start working with your notes
        </EmptyDescription>
        <EmptyContent>
          <Link className={cn(buttonVariants(), 'gap-2')} to="/courses/import">
            <UploadCloud className="size-4" />
            Import Course
          </Link>
        </EmptyContent>
      </Empty>
    )
  return (
    <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
      {courses.map((course) => (
        <CourseHeader
          course={course}
          singleCourse={false}
          key={course.id}
          onExport={() => handleExportCourse(course.id)}
          onDelete={() => handleDeleteCourse(course.id)}
        />
      ))}
    </div>
  )
}

function RouteComponent() {
  const { coursesPromise } = Route.useLoaderData()

  return (
    <Suspense fallback={<Loader2 className="size-40 animate-spin" />}>
      <CoursesList data={coursesPromise} />
    </Suspense>
  )
}
