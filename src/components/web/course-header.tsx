import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Link, useRouter } from '@tanstack/react-router'
import { Button } from '../ui/button'
import { Delete, Download, Loader2 } from 'lucide-react'
import { cn } from '#/lib/utils'
import { useState, useTransition } from 'react'
import { CourseHeaderData, removeTagFromCourseFn } from '#/data/course'
import TagBadge from './tag-badge'
import { handleAction } from '#/lib/client-utils'
import { useServerFn } from '@tanstack/react-start'
import { ClientLoggingMetadata } from '#/schemas/api-utils'

// type Course = {
//   _count?: {
//     notes: number
//   }
// } & {
//   title: string
//   id: string
//   createdAt: Date
//   updatedAt: Date
//   userId: string
//   notes?: any[]
//   tags?: any[]
// }

const CourseHeader = ({
  course,
  singleCourse = true,
  onExport,
  onDelete,
  className,
}: {
  course: CourseHeaderData
  singleCourse?: boolean
  onExport: (id: string) => void
  onDelete: (id: string) => void
  className?: string
}) => {
  const router = useRouter()
  const [deletingTagAssociationId, setDeletingTagAssociationId] = useState<
    string | null
  >(null)
  const [_, startDeleteTagAssociation] = useTransition()
  const [isDeleting, startDeleteTransition] = useTransition()
  const [isExporting, startExportTransition] = useTransition()
  const removeTagFromCourse = useServerFn(removeTagFromCourseFn)
  const isPending = isDeleting || isExporting
  const loggingMetadata: ClientLoggingMetadata = {
    component: 'Course-Header', // Der Name der Komponente
    actionSource: 'Tag-Badge, X-Button',
    feature: 'DeleteTagAssociation', // Optional: Spezifische Aktion
  }
  const countNotes =
    'notes' in course
      ? course.notes && course.notes.length
      : (course._count && course._count.notes) || 0
  const handleDeleteTagAssociation = async (
    courseId: string,
    tagId: string,
  ) => {
    const deleteId = `${courseId}-${tagId}`
    setDeletingTagAssociationId(deleteId)
    startDeleteTagAssociation(async () => {
      try {
        await handleAction(
          removeTagFromCourse({ data: { courseId, tagId, loggingMetadata } }),
          {
            successToast: 'Tag deleted successfully from course',
          },
        )
        router.invalidate()
      } catch (error) {
      } finally {
        setDeletingTagAssociationId(null)
      }
    })
  }
  // course.id === 'b5a3e1fa-dfef-457f-9991-9195362456cd' &&
  //   console.log('Course:', course)
  return (
    <Card
      key={course.id}
      className={cn(
        'group overflow-hidden transition-all hover:shadow-lg px-4 py-2 w-full min-w-0',
        className,
      )}
    >
      <CardHeader className="min-w-0">
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
      </CardHeader>
      <CardContent className="flex flex-col min-w-0">
        <div className="flex gap-2 flex-wrap min-w-0">
          {course.tags.map((t) => (
            <TagBadge
              key={`${course.id}-${t.tag.id}`}
              tag={t.tag}
              onDelete={() => handleDeleteTagAssociation(course.id, t.tag.id)}
              isDeleting={
                deletingTagAssociationId === `${course.id}-${t.tag.id}`
              }
              size="sm"
            />
          ))}
        </div>
        <div className="mt-2 text-sm text-muted-foreground">
          {countNotes} note{countNotes === 1 ? '' : 's'}
        </div>
      </CardContent>
      <CardFooter className="flex flex-row gap-4">
        <Button
          type="button"
          onClick={() => {
            startExportTransition(async () => {
              await onExport(course.id)
            })
          }}
          disabled={isPending}
          className="hover:cursor-pointer"
        >
          {isExporting ? (
            <Loader2 className="size-4 mr-1 animate-spin" />
          ) : (
            <Download className="size-4 mr-1" />
          )}{' '}
          <span
            className={cn('hidden', singleCourse ? 'sm:inline' : 'md:inline')}
          >
            Export
          </span>
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={() =>
            startDeleteTransition(async () => {
              await onDelete(course.id)
            })
          }
          disabled={isPending}
          className="hover:cursor-pointer"
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
    </Card>
  )
}
export default CourseHeader
