import { Link, useRouter } from '@tanstack/react-router'
import { cn } from '#/lib/utils.lib'
import { Card, CardContent, CardDescription } from '../ui/card'
import ReactMarkdown from 'react-markdown'
import {
  BookOpenText,
  Edit2,
  Save,
  X,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react'
import { useTagManagement } from '#/hooks/use-tag-management.hook'
import { TagManager } from './tag-manager'
import type { TagDisplay } from './tag-manager'
import { PAGINATION_DEFAULTS } from '#/schemas/search-params.schema'
import type { Prisma } from '#/lib/db.lib.server'
import { useState, useTransition, Suspense, lazy } from 'react'
import { Button } from '../ui/button'
import { handleAction } from '#/lib/client-utils.lib'
import { updateNoteContentFn } from '#/data/note.data'
import { useServerFn } from '@tanstack/react-start'
// rejectNoteTagFn können wir entfernen, da onRemoveTag (handleDelete) exakt denselben Job macht!
import { approveNoteTagFn } from '#/data/tag.data'

const MarkdownEditor = lazy(() => import('./markdown-editor'))

type BaseNoteData = Prisma.NoteGetPayload<{
  include: {
    course: {
      select: {
        id: true
        title: true
      }
    }
    tags: {
      include: {
        tag: true
      }
    }
  }
}>

interface NoteProps {
  note: Omit<BaseNoteData, 'tags'> & {
    tags?: any[]
    displayTags?: {
      isDirect: boolean
      isFromCourse: boolean
      status?: 'APPROVED' | 'SUGGESTION'
      tag: {
        id: string
        name: string
        userId?: string | null
      }
    }[]
  }
  activeTagIds?: string[]
  showCourseLink?: boolean
  readOnly?: boolean
}

const Note = ({
  note,
  showCourseLink = true,
  activeTagIds = [],
  readOnly = false,
}: NoteProps) => {
  const router = useRouter()

  const {
    availableTags,
    isPending: isTagPending,
    deletingTagId,
    handleLink,
    handleDeleteTagAssociation,
    handleCreateAndLink,
  } = useTagManagement(note.id, 'note', 'NoteCard', readOnly)

  const updateNoteContent = useServerFn(updateNoteContentFn)

  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(
    note.editedContent || note.originalContent,
  )
  const [isPendingSave, startTransition] = useTransition()
  const [showOriginal, setShowOriginal] = useState(false)

  // --- NEU: State für das spezifische Approve-Loading ---
  const [approvingTagId, setApprovingTagId] = useState<string | null>(null)
  const [isApproving, startApproveTransition] = useTransition()

  // Kombinierter Status für alle Tag-Aktionen
  const isAnyTagActionPending = isTagPending || isApproving

  const isEdited = note.editedContent.trim() !== ''

  // --- NEU: Wir mappen den Status in die displayTags ---
  const displayTags: TagDisplay[] = (note.displayTags || []).map((dt) => {
    return {
      id: dt.tag.id,
      name: dt.tag.name,
      userId: dt.tag.userId,
      status: dt.status as 'APPROVED' | 'SUGGESTION', // Kommt jetzt direkt sauber aus dem Backend!
      isInherited: !dt.isDirect && dt.isFromCourse,
      isDeletable: dt.isDirect, // Auch Suggestions sind direkt und damit löschbar
      isHighlighted: activeTagIds.includes(dt.tag.id),
      tooltip:
        dt.status === 'SUGGESTION'
          ? 'AI suggestion'
          : dt.isDirect
            ? 'direct tag'
            : 'inherited from course',
    }
  })

  const handleSave = async () => {
    if (readOnly) return
    startTransition(async () => {
      await handleAction(
        updateNoteContent({
          data: {
            noteId: note.id,
            content: editContent,
            loggingMetadata: {
              component: 'NoteCard',
              feature: 'MDXEditor',
              actionSource: 'TopRight_SaveIcon',
            },
          },
        }),
      )

      setIsEditing(false)
      setShowOriginal(false)
      router.invalidate()
    })
  }

  const handleCancel = () => {
    if (readOnly) return
    setEditContent(note.editedContent || note.originalContent)
    setIsEditing(false)
  }

  const handleApprove = (tagId: string) => {
    if (readOnly) return
    setApprovingTagId(tagId) // Haken wird zum Spinner
    startApproveTransition(async () => {
      try {
        await handleAction(
          approveNoteTagFn({ data: { noteId: note.id, tagId } }),
          {
            showSuccessToast: false,
            showErrorToast: true,
          },
        )
        router.invalidate()
      } finally {
        setApprovingTagId(null)
      }
    })
  }

  const displayContent = showOriginal
    ? note.originalContent
    : note.editedContent || note.originalContent

  return (
    <Card className="relative pt-12">
      {/* Course Link Oben Links */}
      {showCourseLink && (
        <Link
          to="/courses/$courseId"
          params={{ courseId: note.course.id }}
          search={PAGINATION_DEFAULTS}
          className="absolute left-3 top-3 z-10 flex items-center gap-1 text-sm font-medium text-muted-foreground hover:underline"
        >
          <BookOpenText className="size-5" />
          <span className="truncate max-w-50">{note.course.title}</span>
        </Link>
      )}

      {/* Action Buttons & Badges Oben Rechts */}
      <div className="absolute right-2 top-2 z-10 flex items-center gap-3">
        <div className="flex gap-1">
          {!isEditing ? (
            <>
              {isEdited && (
                <Button
                  variant="default"
                  size="icon"
                  className="h-7 w-7 cursor-pointer"
                  onClick={() => setShowOriginal(!showOriginal)}
                  title={
                    showOriginal
                      ? 'show edited version'
                      : 'show original version'
                  }
                >
                  {showOriginal ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </Button>
              )}
              {!readOnly && (
                <Button
                  variant="default"
                  size="icon"
                  className="h-7 w-7 rounded-xl cursor-pointer"
                  onClick={() => setIsEditing(true)}
                  disabled={showOriginal}
                  title={
                    showOriginal
                      ? 'disabled (because you view the original version of the note)'
                      : 'edit'
                  }
                >
                  <Edit2 className="size-4" />
                </Button>
              )}
            </>
          ) : (
            <>
              <Button
                variant="destructive"
                size="icon"
                className="h-7 w-7 cursor-pointer"
                onClick={handleCancel}
                disabled={isPendingSave}
                title="Cancel"
              >
                <X className="size-4" />
              </Button>
              <Button
                variant="default"
                size="icon"
                className="h-7 w-7 cursor-pointer"
                onClick={handleSave}
                disabled={isPendingSave}
                title="Save"
              >
                {isPendingSave ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
              </Button>
            </>
          )}
        </div>

        <span
          className={cn(
            'rounded-lg border-2 px-2 py-0.5 text-sm font-semibold',
            showOriginal ? 'border-muted text-muted-foreground' : 'border-ring',
          )}
        >
          {note.timestamp}
        </span>
      </div>

      <CardDescription className="flex flex-col gap-y-0.5 px-2 py-1">
        <h2 className="text-xl font-semibold">{note.section}</h2>
        <h3 className="text-lg">{note.lecture}</h3>

        <TagManager
          tags={displayTags}
          availableTags={availableTags}
          onAddTag={handleLink}
          onRemoveTag={handleDeleteTagAssociation} // Löscht Tags (und dient als "Reject" für Suggestions)
          onCreateTag={handleCreateAndLink}
          onApproveTag={!readOnly ? handleApprove : undefined} // kommt nicht aus dem Hook, daher muss hier extra auf readOnly getestet werden
          approvingTagId={approvingTagId} // <-- Steuert den Haken-Spinner
          isPending={isAnyTagActionPending}
          deletingTagId={deletingTagId}
          addIconVariant="purple"
        />
      </CardDescription>

      <CardContent className="single-note bg-accent px-2 py-1">
        {isEditing ? (
          <Suspense
            fallback={<div className="h-40 animate-pulse bg-muted rounded" />}
          >
            <MarkdownEditor markdown={editContent} onChange={setEditContent} />
          </Suspense>
        ) : (
          <div
            className={cn(
              'prose prose-stone dark:prose-invert',
              'prose-headings:scroll-m-20',
              'prose-code:before:content-none prose-code:after:contain-none',
              'max-w-full',
              showOriginal && 'opacity-70',
            )}
          >
            <ReactMarkdown
              components={{
                h3: ({ node, ...props }) => (
                  <h3 className="text-lg font-semibold" {...props} />
                ),
              }}
            >
              {displayContent}
            </ReactMarkdown>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default Note
