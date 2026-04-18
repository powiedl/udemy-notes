import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Link } from '@tanstack/react-router'
import { Button } from '../ui/button'
import {
  Check,
  CornerDownLeft,
  Trash2,
  Download,
  Loader2,
  Plus,
  User,
} from 'lucide-react'
import { cn } from '#/lib/utils'
import { useTransition } from 'react'
import { CourseHeaderData } from '#/data/course'
import TagBadge from './tag-badge'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Command, CommandEmpty, CommandInput, CommandList } from '../ui/command'
import { CommandGroup, CommandItem } from 'cmdk'
import { useTagManagement } from '#/hooks/use-tag-management'

interface CourseHeaderProps {
  course: Omit<CourseHeaderData, 'createdAt' | 'updatedAt'> // so, dass es nicht stört, wenn createdAt und updatedAt nicht vorhanden sind
  variant?: 'default' | 'compact'
  singleCourse?: boolean
  onExport?: (id: string) => void
  onDelete?: (id: string) => void
  className?: string
}
const CourseHeader = ({
  course,
  variant = 'default',
  singleCourse = true,
  onExport = async () => {},
  onDelete = async () => {},
  className,
}: CourseHeaderProps) => {
  const {
    availableTags,
    isAdding,
    setIsAdding,
    tagQuery,
    setTagQuery,
    isPending: isTagPending, // Umbenannt, um Konflikte mit isExporting zu vermeiden
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

        {/* Read-Only Tags - Keine Add-Buttons, kein onDelete */}
        {course.tags && course.tags.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mt-2">
            {course.tags.map((t) => (
              <TagBadge
                key={`${course.id}-${t.tag.id}`}
                tag={t.tag}
                size="sm"
                // KEIN onDelete hier!
              />
            ))}
          </div>
        )}
      </div>
    )
  }

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
              onDelete={() => handleDeleteTagAssociation(t.tag.id)}
              isDeleting={deletingTagId === `${course.id}-${t.tag.id}`}
              size="sm"
            />
          ))}
          {/* Der Add-Button mit Popover */}
          <Popover open={isAdding} onOpenChange={setIsAdding}>
            <PopoverTrigger asChild>
              <Button
                // ml-1 für den extra Abstand zum letzten Tag
                // size="sm" als Basis, aber mit h-4 überschrieben für die Badge-Optik
                className="ml-2 h-4 w-6 rounded-md border-dashed border-px-0 hover:border-primary transition-all group/add cursor-pointer"
                disabled={isTagPending}
              >
                {isTagPending ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                ) : (
                  <Plus className="h-3 w-3" />
                )}
              </Button>
            </PopoverTrigger>

            <PopoverContent className="w-64 p-0" align="start">
              <Command
                onKeyDown={(e) => {
                  if (
                    e.key === 'Enter' &&
                    tagQuery.length > 0 &&
                    !availableTags.some((t) => t.name === tagQuery)
                  ) {
                    handleCreateAndLink(tagQuery)
                  }
                }}
              >
                <CommandInput
                  placeholder="search tag ..."
                  value={tagQuery}
                  onValueChange={setTagQuery}
                />
                <CommandList>
                  <CommandEmpty className="p-1">
                    {tagQuery.length > 0 && (
                      <button
                        type="button"
                        className={cn(
                          'flex w-full items-center justify-between px-3 py-2 rounded-md transition-all',
                          'bg-primary text-primary-foreground shadow-sm',
                          'hover:bg-primary/90 cursor-pointer active:scale-[0.98]',
                        )}
                        onClick={() => handleCreateAndLink(tagQuery)}
                      >
                        {/* Text-Bereich: Einzeilig durch truncate */}
                        <Plus className="mr-2 h-3.5 w-3.5 opacity-80" />
                        <span className="text-xs truncate mr-2">
                          <span className="opacity-70 font-light">
                            Create tag{' '}
                          </span>
                          <span className="font-semibold italic">
                            "{tagQuery}"
                          </span>
                        </span>

                        {/* Enter-Icon als visueller Abschluss */}
                        <div className="flex items-center gap-1 opacity-80 shrink-0">
                          <CornerDownLeft className="h-3 w-3" />
                        </div>
                      </button>
                    )}
                  </CommandEmpty>
                  <CommandGroup>
                    {availableTags
                      // Wir filtern Tags aus, die der Kurs bereits hat
                      .filter(
                        (t) => !course.tags.some((ct) => ct.tag.id === t.id),
                      )
                      .map((tag) => (
                        <CommandItem
                          key={tag.id}
                          onSelect={() => handleLink(tag.id)}
                          className="text-xs cursor-pointer hover:bg-accent hover:text-accent-foreground"
                        >
                          <Check className={cn('mr-2 h-3 w-3 opacity-0')} />
                          {tag.name}
                        </CommandItem>
                      ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
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
