import { Link, useRouter } from '@tanstack/react-router'
import { cn } from '#/lib/utils'
import { Card, CardContent, CardDescription } from '../ui/card'
import ReactMarkdown from 'react-markdown'
import { BookOpenText, Edit2, Save, X, Eye, EyeOff } from 'lucide-react'
import { useTagManagement } from '#/hooks/use-tag-management'
import { TagManager } from './tag-manager'
import type { TagDisplay } from './tag-manager'
import { PAGINATION_DEFAULTS } from '#/schemas/search-params'
import type { Prisma } from '#/lib/db.server'
import { useState, useTransition, Suspense, lazy } from 'react'
import { Button } from '../ui/button'
import { handleAction } from '#/lib/client-utils'
import { updateNoteContentFn } from '#/data/note'
import { useServerFn } from '@tanstack/react-start'

const MarkdownEditor = lazy(() => import('./markdown-editor'))

type BaseNoteData = Prisma.NoteGetPayload<{
  include: {
    course: {
      select: {
        id: true
        title: true
      }
    }
  }
}>

interface NoteProps {
  note: BaseNoteData & {
    displayTags?:
      | {
          isDirect: boolean
          isFromCourse: boolean
          tag: { id: string; name: string; userId?: string | null }
        }[]
      | undefined
  }
  activeTagIds?: string[]
  showCourseLink?: boolean
}

const Note = ({
  note,
  showCourseLink = true,
  activeTagIds = [],
}: NoteProps) => {
  const router = useRouter()
  const {
    availableTags,
    isPending,
    deletingTagId,
    handleLink,
    handleDeleteTagAssociation,
    handleCreateAndLink,
  } = useTagManagement(note.id, 'note', 'NoteCard')
  const updateNoteContent = useServerFn(updateNoteContentFn)

  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(
    note.editedContent || note.originalContent,
  )
  const [isPendingSave, startTransition] = useTransition()

  const [showOriginal, setShowOriginal] = useState(false)

  // Prüfen, ob die Notiz von unserem User bearbeitet wurde
  const isEdited = note.editedContent.trim() !== ''

  const displayTags: TagDisplay[] = (note.displayTags || []).map((dt) => ({
    id: dt.tag.id,
    name: dt.tag.name,
    userId: dt.tag.userId,
    isInherited: !dt.isDirect && dt.isFromCourse,
    isDeletable: dt.isDirect,
    isHighlighted: activeTagIds.includes(dt.tag.id),
    tooltip:
      !dt.isDirect && dt.isFromCourse
        ? 'inherited from the course'
        : dt.isDirect && dt.isFromCourse
          ? 'direct tag (but also inherited)'
          : 'direct tag',
  }))

  const handleSave = async () => {
    startTransition(async () => {
      const result = await handleAction(
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
    setEditContent(note.editedContent || note.originalContent)
    setIsEditing(false)
  }

  // Welcher Text soll aktuell als Markdown gerendert werden?
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
              {/* Toggle für Originalansicht (Nur wenn bearbeitet wurde) */}
              {isEdited && (
                <Button
                  variant="default" // {showOriginal ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-7 w-7 cursor-pointer"
                  onClick={() => setShowOriginal(!showOriginal)}
                  title={
                    showOriginal
                      ? 'Geänderte Version anzeigen'
                      : 'Original anzeigen'
                  }
                >
                  {showOriginal ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </Button>
              )}

              {/* Edit Button */}
              <Button
                variant="default"
                size="icon"
                className="h-7 w-7 rounded-xl cursor-pointer"
                onClick={() => setIsEditing(true)}
                disabled={showOriginal}
                title={
                  showOriginal
                    ? 'Im Originalmodus ist das Bearbeiten deaktiviert'
                    : 'Bearbeiten'
                }
              >
                <Edit2 className="size-4" />
              </Button>
            </>
          ) : (
            <>
              {/* ABBRECHEN: Jetzt in Destructive (Rot) */}
              <Button
                variant="destructive"
                size="icon"
                className="h-7 w-7 cursor-pointer"
                onClick={handleCancel}
                disabled={isPendingSave}
                title="Abbrechen"
              >
                <X className="size-4" />
              </Button>

              {/* SPEICHERN: Default (Lila) */}
              <Button
                variant="default"
                size="icon"
                className="h-7 w-7 cursor-pointer"
                onClick={handleSave}
                disabled={isPendingSave}
                title="Speichern"
              >
                <Save className="size-4" />
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
        {/* Tag-Anzeige */}
        <TagManager
          tags={displayTags}
          availableTags={availableTags}
          onAddTag={handleLink}
          onRemoveTag={handleDeleteTagAssociation}
          onCreateTag={handleCreateAndLink}
          isPending={isPending}
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
              // Transparenz für die Read-Only Originalansicht
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
