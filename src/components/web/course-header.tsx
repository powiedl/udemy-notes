import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Link } from '@tanstack/react-router'
import { Button } from '../ui/button'
import { Trash2, Download, Loader2, User } from 'lucide-react'
import { cn } from '#/lib/utils'
import { useTransition } from 'react'
import { CourseHeaderData } from '#/data/course'
import TagBadge from './tag-badge'
import { useTagManagement } from '#/hooks/use-tag-management'
// NEU: TagManager und Interface importieren
import { TagManager, TagDisplay } from './tag-manager'

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

  if (variant === 'compact') {
    return (
      <div
        className={cn(
          'flex flex-col gap-2 p-4 border-b bg-muted/30 rounded-t-lg',
          className,
        )}
      >
        {/* ... (Compact Variant bleibt komplett unverändert, da read-only) ... */}
        <div>
          <Link
            to="/courses/$courseId"
            params={{ courseId: course.id }}
            className="text-lg font-semibold hover:underline"
          >
            {course.title}
          </Link>
          {course.trainer && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
              <User className="h-3.5 w-3.5" />
              <span>{course.trainer}</span>
            </div>
          )}
        </div>
        {course.tags && course.tags.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mt-2">
            {course.tags.map((t) => {
              const isHighlighted = activeTagIds.includes(t.tag.id)
              return (
                <TagBadge
                  key={`${course.id}-${t.tag.id}`}
                  tag={t.tag}
                  className={cn(
                    isHighlighted && 'ring-2 ring-lagoon-deep shadow-sm',
                  )}
                  size="sm"
                />
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // --- NEU: Tags für den TagManager aufbereiten ---
  const displayTags: TagDisplay[] = (course.tags || []).map((t) => ({
    id: t.tag.id,
    name: t.tag.name,
    userId: (t.tag as any).userId,
    isDeletable: true, // Im Header sind alle Tags direkt zugewiesen und löschbar
    isInherited: false, // Kurse erben nicht
    isHighlighted: activeTagIds.includes(t.tag.id),
  }))

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
            <h1 className="text-4xl font-semibold">{course.title}</h1>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col min-w-0">
        {/* --- HIER IST DER NEUE TAG-MANAGER --- */}
        <TagManager
          tags={displayTags}
          availableTags={availableTags}
          onAddTag={handleLink}
          onRemoveTag={handleDeleteTagAssociation}
          onCreateTag={handleCreateAndLink}
          isPending={isTagPending}
          deletingTagId={deletingTagId?.split('-').pop()} // Falls deine Hook IDs wie "courseId-tagId" zurückgibt
          addIconVariant="purple" // Sorgt für den lila Hover-Button!
        />

        <div className="mt-4 flex w-full items-center gap-x-4">
          {course.trainer && (
            <div className="flex min-w-0 items-center gap-1.5 text-lg text-muted-foreground">
              <User className="h-4 w-4 shrink-0" />
              <span className="truncate">{course.trainer}</span>
            </div>
          )}
          <div className="ml-auto whitespace-nowrap text-sm text-muted-foreground">
            {countNotes} note{countNotes === 1 ? '' : 's'}
          </div>
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
