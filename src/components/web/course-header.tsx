import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Link, useRouter } from '@tanstack/react-router'
import { Button } from '../ui/button'
import {
  Check,
  CornerDownLeft,
  Delete,
  Download,
  Loader2,
  Plus,
  User,
} from 'lucide-react'
import { cn } from '#/lib/utils'
import { startTransition, useEffect, useState, useTransition } from 'react'
import {
  CourseHeaderData,
  removeTagFromCourseFn,
  linkTagToCourseFn,
  createAndLinkTagToCourseFn,
} from '#/data/course'
import { getTagsForSelectorFn } from '#/data/tag' // Pfad anpassen
import TagBadge from './tag-badge'
import { handleAction } from '#/lib/client-utils'
import { useServerFn } from '@tanstack/react-start'
import { ClientLoggingMetadata } from '#/schemas/api-utils'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Command, CommandEmpty, CommandInput, CommandList } from '../ui/command'
import { CommandGroup, CommandItem } from 'cmdk'

interface CourseHeaderProps {
  course: CourseHeaderData
  singleCourse?: boolean
  onExport: (id: string) => void
  onDelete: (id: string) => void
  className?: string
}
const CourseHeader = ({
  course,
  singleCourse = true,
  onExport,
  onDelete,
  className,
}: CourseHeaderProps) => {
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
  const [isAdding, setIsAdding] = useState(false)
  const [tagQuery, setTagQuery] = useState('')
  const [availableTags, setAvailableTags] = useState<
    { id: string; name: string; userId: string | null }[]
  >([])

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
  const handleLinkExisting = async (tagId: string) => {
    startTransition(async () => {
      const result = await handleAction(
        linkTagToCourseFn({
          data: {
            courseId: course.id,
            tagId,
            loggingMetadata: { component: 'CourseHeader' },
          },
        }),
        { successToast: 'Tag hinzugefügt' },
      )

      if (result) {
        setIsAdding(false) // Popover schließen
        setTagQuery('') // Input leeren
        router.invalidate() // UI aktualisieren
      }
    })
  }

  // Handler für neue Tags
  const handleCreateAndLink = async (name: string) => {
    if (!name.trim()) return

    startTransition(async () => {
      const result = await handleAction(
        createAndLinkTagToCourseFn({
          data: {
            courseId: course.id,
            tagName: name,
            loggingMetadata: { component: 'CourseHeader' },
          },
        }),
        { successToast: 'Neues Tag erstellt und verknüpft' },
      )

      if (result) {
        setIsAdding(false)
        setTagQuery('')
        router.invalidate()
      }
    })
  }
  // course.id === 'b5a3e1fa-dfef-457f-9991-9195362456cd' &&
  //   console.log('Course:', course)
  useEffect(() => {
    const fetchTags = async () => {
      // handleAction nutzt die getTagsForSelectorFn
      // Wir übergeben ein leeres Objekt für die data, da der Validator z.object({}) verlangt
      const result = await handleAction(
        getTagsForSelectorFn({
          data: {
            loggingMetadata: { component: 'CourseHeader' },
          },
        }),
      )

      if (result) {
        // getTagsForSelectorFn gibt direkt das Array von Prisma zurück (kein .items nötig)
        // result ist hier also direkt Tag[]
        setAvailableTags(result)
      }
    }

    fetchTags()
  }, [])
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
          {/* Der Add-Button mit Popover */}
          <Popover open={isAdding} onOpenChange={setIsAdding}>
            <PopoverTrigger asChild>
              <Button
                // ml-1 für den extra Abstand zum letzten Tag
                // size="sm" als Basis, aber mit h-4 überschrieben für die Badge-Optik
                className="ml-2 h-4 w-6 rounded-md border-dashed border-px-0 hover:border-primary transition-all group/add cursor-pointer"
                disabled={isPending}
              >
                {isPending ? (
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
                          onSelect={() => handleLinkExisting(tag.id)}
                          className="text-xs"
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
