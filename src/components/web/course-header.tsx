import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Link } from '@tanstack/react-router'
import { Button } from '../ui/button'
import { Trash2, Download, Loader2 } from 'lucide-react'
import { cn } from '#/lib/utils'
import { useTransition } from 'react'
import { CourseHeaderData } from '#/data/course'
import { useTagManagement } from '#/hooks/use-tag-management'
import { TagManager, TagDisplay } from './tag-manager'
import { PAGINATION_DEFAULTS } from '#/schemas/search-params'
import { TrainerDisplay, TrainerManager } from './trainer-manager'

interface CourseHeaderProps {
  course: Omit<CourseHeaderData, 'createdAt' | 'updatedAt'>
  variant?: 'default' | 'compact'
  singleCourse?: boolean
  onExport?: (id: string) => void
  onDelete?: (id: string) => void
  className?: string
  activeTagIds?: string[]
}

const CourseHeader = ({
  course,
  variant = 'default',
  singleCourse = true,
  onExport = async () => {},
  onDelete = async () => {},
  className,
  activeTagIds = [],
}: CourseHeaderProps) => {
  const {
    availableTags,
    isPending: isTagPending,
    deletingTagId,
    handleLink,
    handleCreateAndLink,
    handleDeleteTagAssociation,
  } = useTagManagement(course.id, 'course', 'CourseHeader')

  const [isDeleting, startDeleteTransition] = useTransition()
  const [isExporting, startExportTransition] = useTransition()
  const isPending = isDeleting || isExporting || isTagPending

  const countNotes =
    'notes' in course
      ? course.notes && course.notes.length
      : (course._count && course._count.notes) || 0

  const displayTags: TagDisplay[] = (course.tags || []).map((t) => ({
    id: t.tag.id,
    name: t.tag.name,
    userId: t.tag.userId,
    isDeletable: variant === 'default' ? true : false,
    isInherited: false,
    isHighlighted: activeTagIds.includes(t.tag.id),
  }))

  const trainersDisplay = course.trainers.map(
    (t): TrainerDisplay => ({
      name: t.trainer.name,
      id: t.trainer.id,
      isDeletable: variant === 'default',
    }),
  )
  const trainerSize = singleCourse ? 'default' : 'sm'

  if (variant === 'compact') {
    return (
      <div
        className={cn(
          'flex flex-col gap-2 p-4 border-b bg-muted/30 rounded-t-lg',
          className,
        )}
      >
        <Link
          to="/courses/$courseId"
          params={{ courseId: course.id }}
          search={PAGINATION_DEFAULTS}
          className="text-lg font-semibold hover:underline"
        >
          {course.title}
        </Link>
        <TrainerManager
          trainers={trainersDisplay}
          courseId={course.id}
          size={trainerSize}
          isEditable={false} // in compact mode you are not allowed to edit the trainers of the course
        />
        <TagManager
          tags={displayTags}
          availableTags={availableTags}
          isPending={isTagPending}
          deletingTagId={deletingTagId?.split('-').pop()}
          addIconVariant="purple"
        />
      </div>
    )
  }

  return (
    <Card
      key={course.id}
      className={cn(
        'group overflow-hidden transition-all hover:shadow-lg px-4 py-2 w-full min-w-0 gap-2 my-2',
        className,
      )}
    >
      <CardHeader className="min-w-0">
        <CardTitle className="text-lg font-semibold">
          {!singleCourse ? (
            <Link
              to="/courses/$courseId"
              params={{ courseId: course.id }}
              search={PAGINATION_DEFAULTS}
              className="block line-clamp-3"
            >
              {course.title}
            </Link>
          ) : (
            <h1 className="text-4xl font-semibold">{course.title}</h1>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col min-w-0 gap-y-2 mb-2">
        <div className="flex w-full flex-row space-between items-center gap-x-4">
          <TrainerManager
            courseId={course.id}
            trainers={trainersDisplay}
            size={trainerSize}
          />
          <div className="ml-auto whitespace-nowrap text-sm text-muted-foreground">
            {countNotes} note{countNotes === 1 ? '' : 's'}
          </div>
        </div>
        <TagManager
          tags={displayTags}
          availableTags={availableTags}
          onAddTag={handleLink}
          onRemoveTag={handleDeleteTagAssociation}
          onCreateTag={handleCreateAndLink}
          isPending={isTagPending}
          deletingTagId={deletingTagId?.split('-').pop()}
          addIconVariant="purple"
        />
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
            <Trash2 className="size-4 mr-1" />
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
