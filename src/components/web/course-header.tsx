import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { useRouter, Link } from '@tanstack/react-router'
import { Button } from '../ui/button'
import { Sparkles, Trash2, Download, Loader2 } from 'lucide-react'
import { cn } from '#/lib/utils'
import { useState, useTransition } from 'react'
import type { CourseHeaderData } from '#/data/course'
import { useTagManagement } from '#/hooks/use-tag-management'
import { TagManager } from './tag-manager'
import type { TagDisplay } from './tag-manager'
import { PAGINATION_DEFAULTS } from '#/schemas/search-params'
import type { TrainerDisplay } from './trainer-manager'
import { TrainerManager } from './trainer-manager'
import ExportCourseDialog from '../export-course-dialog'
import type { ExportMdFileSchema } from '#/schemas/export-file'

// --- NEU: Imports für AI Tagging Dialog und Save-Funktion ---
import { autoTagCourseBatchFn, approveCourseTagsBatchFn } from '#/data/tag'
import { handleAction } from '#/lib/client-utils'
import {
  AITagSuggestionForDialog,
  ReviewCourseTagsDialog,
} from './review-course-tags-dialog'
import { toast } from 'sonner' // Für die Info, falls keine Tags gefunden wurden

interface CourseHeaderProps {
  course: Omit<CourseHeaderData, 'createdAt' | 'updatedAt'>
  isAdmin?: boolean
  variant?: 'default' | 'compact'
  singleCourse?: boolean
  onExport?: (data: ExportMdFileSchema) => void
  onDelete?: (id: string) => void
  className?: string
  activeTagIds?: string[]
}

const CourseHeader = ({
  course,
  isAdmin,
  variant = 'default',
  singleCourse = true,
  onExport,
  onDelete,
  className,
  activeTagIds = [],
}: CourseHeaderProps) => {
  const router = useRouter()

  const {
    availableTags,
    isPending: isTagPending,
    deletingTagId,
    handleLink,
    handleCreateAndLink,
    handleDeleteTagAssociation,
  } = useTagManagement(course.id, 'course', 'CourseHeader')

  const [reviewTags, setReviewTags] = useState<
    AITagSuggestionForDialog[] | null
  >(null)
  const [isDeleting, startDeleteTransition] = useTransition()
  const [isExporting, startExportTransition] = useTransition()
  const [isAITagging, startAITaggingTransition] = useTransition()
  // --- NEU: Transition für das Speichern der Tags aus dem Dialog ---
  const [isSavingTags, startSavingTagsTransition] = useTransition()

  // KI-Tagging blockiert jetzt ebenfalls alle anderen Buttons
  const isPending = isDeleting || isExporting || isTagPending || isAITagging

  const countNotes =
    'notes' in course
      ? course.notes && course.notes.length
      : (course._count && course._count.notes) || 0

  const displayTags: TagDisplay[] = course.tags.map((t) => ({
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

  const handleExport = (data: ExportMdFileSchema) => {
    const params = data
    if (!onExport) return
    startExportTransition(async () => {
      await onExport(params)
    })
  }

  // --- NEU: Die reparierte AI Tagging Handler-Funktion ---
  const handleAITagging = () => {
    startAITaggingTransition(async () => {
      try {
        const result = await handleAction(
          autoTagCourseBatchFn({ data: { courseId: course.id } }),
          {
            showSuccessToast: true,
            showErrorToast: true,
          },
        )

        // Router invalidieren, um Notiz-Listen auf den neuesten Stand (SUGGESTIONS) zu bringen
        router.invalidate()

        // Dialog öffnen, wenn Tags für den Kurs gefunden wurden
        if (
          result.courseTagsSuggested &&
          result.courseTagsSuggested.length > 0
        ) {
          setReviewTags(result.courseTagsSuggested)
        } else {
          toast.info('Für den Kurs selbst wurden keine neuen Tags gefunden.')
        }
      } catch (error) {
        // Fehler wurden bereits von handleAction als Toast angezeigt.
      }
    })
  }

  // --- NEU: Handler für den Save-Button im Dialog ---
  const handleSaveReviewTags = (selectedTagNames: string[]) => {
    startSavingTagsTransition(async () => {
      try {
        await handleAction(
          approveCourseTagsBatchFn({
            data: { courseId: course.id, tagNames: selectedTagNames },
          }),
          { showSuccessToast: true, showErrorToast: true },
        )

        setReviewTags(null) // Dialog schließen
        router.invalidate() // UI aktualisieren (jetzt sind die neuen Tags am Kurs sichtbar)
      } catch (e) {}
    })
  }

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
          isEditable={false}
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
    // --- NEU: Ein leeres Fragment <> um Card und Dialog ---
    <>
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
            variant="secondary"
            onClick={handleAITagging}
            disabled={isPending}
            className="hover:cursor-pointer"
          >
            {isAITagging ? (
              <Loader2 className="size-4 mr-1 animate-spin" />
            ) : (
              <Sparkles className="size-4 mr-1 text-amber-500" />
            )}
            <span
              className={cn('hidden', singleCourse ? 'sm:inline' : 'md:inline')}
            >
              {isAITagging ? 'Tagging...' : 'Auto-Tag'}
            </span>
          </Button>

          <ExportCourseDialog
            isAdmin={isAdmin}
            courseId={course.id}
            onExportSubmit={handleExport}
            disabled={isPending}
            className="hover:cursor-pointer"
          >
            <>
              {isExporting ? (
                <Loader2 className="size-4 mr-1 animate-spin" />
              ) : (
                <Download className="size-4 mr-1" />
              )}{' '}
              <span
                className={cn(
                  'hidden',
                  singleCourse ? 'sm:inline' : 'md:inline',
                )}
              >
                Export
              </span>
            </>
          </ExportCourseDialog>

          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              if (!onDelete) return
              startDeleteTransition(async () => {
                await onDelete(course.id)
              })
            }}
            disabled={isPending}
            className="hover:cursor-pointer"
          >
            {isDeleting ? (
              <Loader2 className={cn('size-4 animate-spin mr-1 inline')} />
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

      {/* --- NEU: Der Dialog für die Course-Tags wird hier eingebunden --- */}
      <ReviewCourseTagsDialog
        tags={reviewTags}
        isOpen={reviewTags !== null}
        onOpenChange={(open) => !open && setReviewTags(null)}
        onSave={handleSaveReviewTags}
        isSaving={isSavingTags}
      />
    </>
  )
}

export default CourseHeader
