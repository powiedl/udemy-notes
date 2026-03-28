import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Link } from '@tanstack/react-router'

type Course = {
  _count?: {
    notes: number
  }
} & {
  title: string
  id: string
  createdAt: Date
  updatedAt: Date
  userId: string
  notes?: any[]
}

const CourseHeader = ({
  course,
  singleCourse = true,
}: {
  course: Course
  singleCourse?: boolean
}) => {
  const countNotes =
    'notes' in course
      ? course.notes && course.notes.length
      : (course._count && course._count.notes) || 0
  return (
    <Card
      key={course.id}
      className="group overflow-hidden transition-all hover:shadow-lg px-4 py-2"
    >
      <CardHeader>
        <CardTitle className="text-lg font-semibold">
          {!singleCourse ? (
            <Link
              to="/courses/$courseId"
              params={{ courseId: course.id }}
              className="block line-clamp-3"
            >
              {course.title}
            </Link>
          ) : (
            <h1 className="text-4xl  font-semibold">{course.title}</h1>
          )}
        </CardTitle>
        <CardContent className="flex flex-col">
          <div>Tags</div>
          <div>
            {countNotes} note{countNotes === 1 ? '' : 's'}
          </div>
        </CardContent>
        <CardFooter>CTA Buttons</CardFooter>
      </CardHeader>
    </Card>
  )
}
export default CourseHeader
