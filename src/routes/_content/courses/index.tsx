import { buttonVariants } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#/components/ui/empty'
import { getCoursesFn } from '#/data/course'
import { cn } from '#/lib/utils'
import { createFileRoute, Link } from '@tanstack/react-router'
import { BookOpenText, Loader2, UploadCloud } from 'lucide-react'
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
        <Card
          key={course.id}
          className="group overflow-hidden transition-all hover:shadow-lg px-4 py-2"
        >
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              <Link
                to="/courses/$courseId"
                params={{ courseId: course.id }}
                className="block line-clamp-3"
              >
                {course.title}
              </Link>
            </CardTitle>
            <CardContent className="flex flex-col">
              <div>Tags</div>
              <div>
                {course._count.notes} note{course._count.notes === 1 ? '' : 's'}
              </div>
            </CardContent>
            <CardFooter>CTA Buttons</CardFooter>
          </CardHeader>
        </Card>
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
