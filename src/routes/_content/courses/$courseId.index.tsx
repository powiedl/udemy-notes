import { Card, CardContent, CardHeader } from '#/components/ui/card'
import CourseHeader from '#/components/web/course-header'
import NotesList from '#/components/web/notes-list'
import { getCourseById } from '#/data/course'
import {
  handleDeleteCourse,
  handleExportCourse,
} from '#/handlers/course-header'
import { createFileRoute } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { Suspense, use, useEffect } from 'react'

export const Route = createFileRoute('/_content/courses/$courseId/')({
  component: RouteComponent,
  loader: ({ params }) => ({
    coursePromise: getCourseById({ data: { id: params.courseId } }),
  }),
})

function Course({ data }: { data: ReturnType<typeof getCourseById> }) {
  const course = use(data)
  useEffect(() => {
    document.title = course.title || 'Course Details'
  }, [course.title])
  return (
    <Card>
      <CardHeader>
        <CourseHeader
          course={course}
          onExport={() => handleExportCourse(course.id)}
          onDelete={() => handleDeleteCourse(course.id)}
        />
      </CardHeader>
      <CardContent>
        <NotesList notes={course.notes} />
      </CardContent>
    </Card>
  )
}
function RouteComponent() {
  const { coursePromise } = Route.useLoaderData()
  //console.log(data)
  return (
    <div className="px-4">
      <Suspense fallback={<Loader2 className="size-40 animate-spin mx-auto" />}>
        <Course data={coursePromise} />
      </Suspense>
    </div>
  )
}
