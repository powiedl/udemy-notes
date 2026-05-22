import { Card } from '#/components/ui/card'
import { useRouter, Link } from '@tanstack/react-router'
import { Button } from '../ui/button'
import {
  Sparkles,
  Trash2,
  Download,
  Loader2,
  Share2,
  LinkIcon,
} from 'lucide-react'
import { cn } from '#/lib/utils.lib'
import { useState, useTransition, createContext, useContext } from 'react'
import type { CourseHeaderData } from '#/data/course.data'
import { useTagManagement } from '#/hooks/use-tag-management.hook'
import { TagManager } from './tag-manager'
import type { TagDisplay } from './tag-manager'
import { PAGINATION_DEFAULTS } from '#/schemas/search-params.schema'
import type { TrainerDisplay } from './trainer-manager'
import { TrainerManager } from './trainer-manager'
import ExportCourseDialog from '../export-course-dialog'
import type { ExportMdFileSchema } from '#/schemas/export-file.schema'
import { autoTagCourseBatchFn, approveCourseTagsBatchFn } from '#/data/tag.data'
import { handleAction } from '#/lib/client-utils.lib'
import { ReviewCourseTagsDialog } from './review-course-tags-dialog'
import type { AITagSuggestionForDialog } from './review-course-tags-dialog'
import { toast } from 'sonner'
import { useServerFn } from '@tanstack/react-start'
import { ActionIconButton } from '../ui/action-icon-button'

interface CourseHeaderProps {
  course: Omit<CourseHeaderData, 'createdAt' | 'updatedAt'>
  readOnly?: boolean
  isAdmin?: boolean
  variant?: 'default' | 'compact'
  singleCourse?: boolean
  onExport?: (data: ExportMdFileSchema) => void
  onDelete?: (id: string) => void
  onShare?: (id: string) => void
  className?: string
  activeTagIds?: string[]
}

// ==========================================
// 1. CONTEXT SETUP (Gegen Prop-Drilling)
// ==========================================

interface CourseHeaderContextValue extends CourseHeaderProps {
  // Abgeleitete Werte
  countNotes: number
  displayTags: TagDisplay[]
  trainersDisplay: TrainerDisplay[]
  trainerSize: 'default' | 'sm'

  // UI State & Transitions
  isPending: boolean
  isAITagging: boolean
  isExporting: boolean
  isDeleting: boolean
  isSharing: boolean

  // Handlers
  handleAITagging: () => void
  handleExport: (data: ExportMdFileSchema) => void
  handleOnShare: () => void
  startDeleteTransition: (callback: () => void) => void

  // Tag Management
  availableTags: any[]
  isTagPending: boolean
  deletingTagId?: string | null
  handleLink?: (tagId: string) => Promise<void>
  handleCreateAndLink?: (name: string) => Promise<void>
  handleDeleteTagAssociation?: (tagId: string) => Promise<void>
}

const CourseHeaderContext = createContext<CourseHeaderContextValue | null>(null)

const useCourseHeaderContext = () => {
  const context = useContext(CourseHeaderContext)
  if (!context) {
    throw new Error('useCourseHeaderContext must be used within CourseHeader')
  }
  return context
}

// ==========================================
// 2. SUB-KOMPONENTEN
// ==========================================

const HeaderImage = () => {
  const { course, singleCourse } = useCourseHeaderContext()

  if (!course.imageUrl) return null

  if (singleCourse) {
    return (
      <img
        src={course.imageUrl}
        className="w-24 h-24 sm:w-32 sm:h-32 shrink-0 rounded-md object-cover border border-muted"
        alt=""
      />
    )
  }

  return (
    <img
      src={course.imageUrl}
      className="size-8 shrink-0 rounded-md object-cover"
      alt=""
    />
  )
}

const HeaderTitle = () => {
  const { course, singleCourse } = useCourseHeaderContext()
  const titleWords = course.title.trim().split(' ')
  const lastWord = titleWords.pop() // Das letzte Wort schnappen
  const firstPart = titleWords.join(' ') // Den Rest wieder zusammenfügen

  if (singleCourse) {
    return (
      <div className="flex gap-x-2">
        <h1 className="text-4xl font-semibold wrap-break-word">
          {firstPart && `${firstPart} `}
          {/* `${firstPart} ` ist notwendig, damit nach firstPart sicher ein Leerzeichen kommt */}
          <span className="whitespace-nowrap">
            {lastWord}

            {course.courseUrl && (
              <a
                href={course.courseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block ml-3 hover:scale-110 transition-transform dark:brightness-110 hover:brightness-90 hover:dark:brightness-125 -translate-y-0.5"
              >
                <LinkIcon className="size-6 text-primary" strokeWidth={3} />
              </a>
            )}
          </span>
        </h1>
      </div>
    )
  }

  return (
    <Link
      to="/courses/$courseId"
      params={{ courseId: course.id }}
      search={PAGINATION_DEFAULTS}
      className="block line-clamp-3 text-lg font-semibold"
    >
      {course.title}
    </Link>
  )
}

const HeaderShareButton = () => {
  const { readOnly, onShare, handleOnShare, isPending, isSharing } =
    useCourseHeaderContext()

  if (readOnly || !onShare) return null

  return (
    <ActionIconButton
      actionVariant="purple"
      actionSize="md"
      onClick={handleOnShare}
      disabled={isPending}
      title="Share Course"
    >
      {isSharing ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : (
        <Share2 className="size-4" />
      )}
    </ActionIconButton>
  )
}

const HeaderTrainerManager = () => {
  const { course, trainersDisplay, trainerSize, readOnly } =
    useCourseHeaderContext()
  return (
    <TrainerManager
      courseId={course.id}
      trainers={trainersDisplay}
      size={trainerSize}
      isEditable={!readOnly}
    />
  )
}

const HeaderMeta = () => {
  const { countNotes } = useCourseHeaderContext()

  return (
    <div className="flex w-full flex-row justify-between items-center gap-x-4 min-w-0">
      <HeaderTrainerManager />
      <div className="ml-auto whitespace-nowrap text-sm text-muted-foreground">
        {countNotes} note{countNotes === 1 ? '' : 's'}
      </div>
    </div>
  )
}

const HeaderTagManager = () => {
  const {
    displayTags,
    availableTags,
    readOnly,
    isTagPending,
    deletingTagId,
    handleLink,
    handleDeleteTagAssociation,
    handleCreateAndLink,
  } = useCourseHeaderContext()

  return (
    <div className="min-w-0">
      <TagManager
        tags={displayTags}
        availableTags={availableTags}
        onAddTag={!readOnly ? handleLink : undefined}
        onRemoveTag={!readOnly ? handleDeleteTagAssociation : undefined}
        onCreateTag={!readOnly ? handleCreateAndLink : undefined}
        isPending={isTagPending}
        deletingTagId={deletingTagId?.split('-').pop()}
        addIconVariant="purple"
      />
    </div>
  )
}

const HeaderFooter = () => {
  const {
    readOnly,
    handleAITagging,
    isPending,
    isAITagging,
    singleCourse,
    isAdmin,
    course,
    handleExport,
    isExporting,
    onDelete,
    startDeleteTransition,
    isDeleting,
  } = useCourseHeaderContext()

  if (readOnly) return null

  return (
    <div className="flex flex-row gap-4 pt-1 border-t border-border/50">
      <Button
        type="button"
        onClick={handleAITagging}
        disabled={isPending}
        className="hover:cursor-pointer"
      >
        {isAITagging ? (
          <Loader2 className="size-4 mr-1 animate-spin" />
        ) : (
          <Sparkles className="size-4 mr-1" />
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
        className="cursor-pointer"
      >
        <>
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
    </div>
  )
}

const HeaderDescription = () => {
  const { readOnly, course } = useCourseHeaderContext()

  if (readOnly) return null
  if (!course.description) return null

  return (
    <p className="mt-0.5 text-muted-foreground text-base">
      {course.description}
    </p>
  )
}

// ==========================================
// 3. HAUPTKOMPONENTE (Provider & Layouts)
// ==========================================

const CourseHeader = (props: CourseHeaderProps) => {
  const {
    course,
    readOnly = false,
    variant = 'default',
    singleCourse = true,
    activeTagIds = [],
    className,
  } = props

  const router = useRouter()

  const {
    availableTags,
    isPending: isTagPending,
    deletingTagId,
    handleLink,
    handleCreateAndLink,
    handleDeleteTagAssociation,
  } = useTagManagement(course.id, 'course', 'CourseHeader', readOnly)

  const [reviewTags, setReviewTags] = useState<
    AITagSuggestionForDialog[] | null
  >(null)

  const [isDeleting, startDeleteTransition] = useTransition()
  const [isExporting, startExportTransition] = useTransition()
  const [isAITagging, startAITaggingTransition] = useTransition()
  const [isSavingTags, startSavingTagsTransition] = useTransition()
  const [isSharing, startShareTransition] = useTransition()

  const autoTagCourseBatch = useServerFn(autoTagCourseBatchFn)
  const approveCourseTagsBatch = useServerFn(approveCourseTagsBatchFn)

  const isPending =
    isDeleting || isExporting || isTagPending || isAITagging || isSharing

  const countNotes =
    ('notes' in course ? course.notes?.length : course._count?.notes) ?? 0

  const displayTags: TagDisplay[] = course.tags.map((t) => ({
    id: t.tag.id,
    name: t.tag.name,
    userId: t.tag.userId,
    status: 'APPROVED',
    isDeletable: variant === 'default' ? true : false,
    isInherited: false,
    isHighlighted: activeTagIds.includes(t.tag.id),
  }))

  const trainersDisplay = course.trainers.map(
    (t): TrainerDisplay => ({
      name: t.trainer.name,
      id: t.trainer.id,
      profileUrl: t.trainer.profileUrl || undefined,
      isDeletable: !readOnly && variant === 'default',
    }),
  )
  const trainerSize = singleCourse ? 'default' : 'sm'

  const handleExport = (data: ExportMdFileSchema) => {
    if (readOnly || !props.onExport) return
    startExportTransition(async () => {
      await props.onExport!(data)
    })
  }

  const handleAITagging = () => {
    if (readOnly) return
    startAITaggingTransition(async () => {
      try {
        const result = await handleAction(
          autoTagCourseBatch({ data: { courseId: course.id } }),
          { showSuccessToast: true, showErrorToast: true },
        )
        router.invalidate()
        if (result.courseTagsSuggested.length > 0) {
          setReviewTags(result.courseTagsSuggested)
        } else {
          toast.info('Für den Kurs selbst wurden keine neuen Tags gefunden.')
        }
      } catch (error) {}
    })
  }

  const handleSaveReviewTags = (selectedTagNames: string[]) => {
    if (readOnly) return
    startSavingTagsTransition(async () => {
      try {
        await handleAction(
          approveCourseTagsBatch({
            data: { courseId: course.id, tagNames: selectedTagNames },
          }),
          { showSuccessToast: true, showErrorToast: true },
        )
        setReviewTags(null)
        router.invalidate()
      } catch (e) {}
    })
  }

  const handleOnShare = () => {
    if (readOnly || !props.onShare) return
    startShareTransition(async () => {
      await props.onShare!(course.id)
    })
  }

  // --- Context Value bündeln ---
  const contextValue: CourseHeaderContextValue = {
    ...props,
    readOnly,
    variant,
    singleCourse,
    countNotes,
    displayTags,
    trainersDisplay,
    trainerSize,
    isPending,
    isAITagging,
    isExporting,
    isDeleting,
    isSharing,
    handleAITagging,
    handleExport,
    handleOnShare,
    startDeleteTransition,
    availableTags,
    isTagPending,
    deletingTagId,
    handleLink,
    handleCreateAndLink,
    handleDeleteTagAssociation,
  }
  // console.log('CourseHeader, course:', course)
  // console.log('CourseHeader, trainersDisplay:', trainersDisplay)

  return (
    <CourseHeaderContext.Provider value={contextValue}>
      <>
        {variant === 'compact' ? (
          // ==========================================
          // LAYOUT: COMPACT
          // ==========================================
          <div
            className={cn(
              'flex flex-col gap-2 p-4 border-b bg-muted/30 rounded-t-lg',
              className,
            )}
          >
            <div className="relative">
              <div className="flex-1 min-w-0 flex items-center gap-3">
                <HeaderImage />
                <Link
                  to="/courses/$courseId"
                  params={{ courseId: course.id }}
                  search={PAGINATION_DEFAULTS}
                  className="text-lg font-semibold hover:underline"
                >
                  {course.title}
                </Link>
              </div>
            </div>
            <HeaderTrainerManager />
            <HeaderTagManager />
          </div>
        ) : (
          // ==========================================
          // LAYOUT: DEFAULT
          // ==========================================
          <Card
            key={course.id}
            className={cn(
              'group overflow-hidden transition-all hover:shadow-lg px-4 py-3 w-full min-w-0 flex flex-col gap-4 my-2',
              className,
            )}
          >
            {singleCourse ? (
              // SUB-LAYOUT: SINGLE COURSE
              <div>
                <div className="flex flex-row gap-4 min-w-0">
                  <HeaderImage />
                  <div className="flex-1 min-w-0 flex flex-col gap-y-3">
                    <div className="flex items-start justify-between gap-4 min-w-0">
                      <div className="flex-1 min-w-0">
                        <HeaderTitle />
                      </div>
                      <HeaderShareButton />
                    </div>
                    <HeaderMeta />
                    <HeaderTagManager />
                  </div>
                </div>
                <HeaderDescription />
              </div>
            ) : (
              // SUB-LAYOUT: COURSE LIST
              <div className="flex flex-col gap-y-3 min-w-0">
                <div className="flex items-start justify-between gap-4 min-w-0">
                  <div className="flex-1 min-w-0 flex items-center gap-4">
                    <HeaderImage />
                    <div className="flex-1 min-w-0">
                      <HeaderTitle />
                    </div>
                  </div>
                  <HeaderShareButton />
                </div>
                <HeaderMeta />
                <HeaderTagManager />
              </div>
            )}

            <HeaderFooter />
          </Card>
        )}

        {/* Dialog (Rendert außerhalb der Card, gesteuert durch State) */}
        {!readOnly && (
          <ReviewCourseTagsDialog
            tags={reviewTags}
            isOpen={reviewTags !== null}
            onOpenChange={(open) => !open && setReviewTags(null)}
            onSave={handleSaveReviewTags}
            isSaving={isSavingTags}
          />
        )}
      </>
    </CourseHeaderContext.Provider>
  )
}

export default CourseHeader
