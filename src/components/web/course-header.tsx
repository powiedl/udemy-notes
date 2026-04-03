import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { Button } from '../ui/button'
import { Delete, Download, Loader2 } from 'lucide-react'
import { cn } from '#/lib/utils'
import { useTransition } from 'react'
import { UdNoServerResponse } from '#/types/api'
import { toast } from 'sonner'

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

const CourseHeader = <T,>({
  course,
  singleCourse = true,
  onExport,
  onDelete,
}: {
  course: Course
  singleCourse?: boolean
  onExport: (id: string) => void
  onDelete: (id: string) => Promise<UdNoServerResponse<T>>
}) => {
  const [isDeleting, startTransition] = useTransition()
  const router = useRouter()
  const navigate = useNavigate()
  const countNotes =
    'notes' in course
      ? course.notes && course.notes.length
      : (course._count && course._count.notes) || 0
  const handleDelete = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    startTransition(async () => {
      try {
        const result = await onDelete(course.id)
        if (!result.success) throw new Error(result.error)
        if (typeof result.data === 'string') {
          toast.success(result.data)
        } else {
          toast.success('Course deleted successfully')
        }
        if (singleCourse) {
          await navigate({ to: '/courses', replace: true })
        } else {
          await router.invalidate()
        }
      } catch (error) {
        console.log(error)
        if (typeof error === 'string') {
          toast.error(error)
        } else {
          toast.error(
            'Something unexptected happened while trying to delete the course',
          )
        }
      }
    })
  }
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
        <CardFooter className="flex flex-row gap-4">
          <Button type="button" onClick={() => onExport(course.id)}>
            <Download className="size-4 mr-1" />
            <span
              className={cn('hidden', singleCourse ? 'sm:inline' : 'md:inline')}
            >
              Export
            </span>
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <Loader2
                className={cn(
                  'size-4 hidden animate-spin mr-1',
                  isDeleting ? 'inline' : '',
                )}
              />
            ) : (
              <Delete className="size-4 mr-1" />
            )}
            <span
              className={cn('hidden', singleCourse ? 'sm:inline' : 'md:inline')}
            >
              {isDeleting ? 'Deleting' : 'Delete'}
            </span>
          </Button>
        </CardFooter>
      </CardHeader>
    </Card>
  )
}
export default CourseHeader
