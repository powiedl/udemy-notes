import CourseHeader from '#/components/web/course-header'
import { getCourseById } from '#/data/course'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_content/courses/$courseId/')({
  component: RouteComponent,
  loader: ({ params }) => getCourseById({ data: { id: params.courseId } }),
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.title ?? 'Course Details' }],
  }),
})

function RouteComponent() {
  const data = Route.useLoaderData()
  //console.log(data)
  return (
    <div className="px-4">
      <CourseHeader course={data} />
    </div>
  )
}
