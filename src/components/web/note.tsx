import { Link } from '@tanstack/react-router'
import { cn } from '#/lib/utils'
import { Card, CardContent, CardDescription } from '../ui/card'
import ReactMarkdown from 'react-markdown'
import { BookOpenText } from 'lucide-react'
import { useTagManagement } from '#/hooks/use-tag-management' // Pfad prüfen!
import { TagDisplay, TagManager } from './tag-manager'
import { PAGINATION_DEFAULTS } from '#/schemas/search-params'
import { Prisma } from '#/lib/db.server'

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
  // ... andere Props
  activeTagIds?: string[]
  showCourseLink?: boolean
}
const Note = ({
  note,
  showCourseLink = true,
  activeTagIds = [],
}: NoteProps) => {
  const {
    availableTags,
    isPending,
    deletingTagId,
    handleLink,
    handleDeleteTagAssociation,
    handleCreateAndLink,
  } = useTagManagement(note.id, 'note', 'NoteCard')
  // mit MyArrayType[number] erhält man den Typ eines einzelnen Elements in dem Array

  // Logik für die Anzeige-Tags vorbereiten
  const displayTags: TagDisplay[] = (note.displayTags || []).map((dt) => ({
    id: dt.tag.id,
    name: dt.tag.name,
    userId: dt.tag.userId, // Falls vorhanden
    isInherited: !dt.isDirect && dt.isFromCourse,
    isDeletable: dt.isDirect, // Nur direkte Tags löschbar
    isHighlighted: activeTagIds.includes(dt.tag.id),
    tooltip:
      !dt.isDirect && dt.isFromCourse
        ? 'inherited from the course'
        : dt.isDirect && dt.isFromCourse
          ? 'direct tag (but also inherited)'
          : 'direct tag',
  }))

  return (
    <Card className="relative pt-12">
      {/* Schwebend Oben Links */}
      {showCourseLink && note.course && (
        <Link
          to="/courses/$courseId"
          params={{ courseId: note.course.id }}
          search={PAGINATION_DEFAULTS}
          className="absolute left-3 top-3 z-10 flex items-center gap-1 text-sm font-medium text-muted-foreground hover:underline"
        >
          <BookOpenText className="size-5" />
          <span className="truncate max-w-50">{note.course.title}</span>{' '}
          {/* truncate verhindert, dass sehr lange Titel in die Zeit laufen */}
        </Link>
      )}

      {/* Schwebend Oben Rechts */}
      <span className="absolute right-2 top-2 z-10 rounded-lg border-2 border-ring px-2 py-0.5 text-sm font-semibold">
        {note.timestamp}
      </span>

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
        <div
          className={cn(
            'prose prose-stone dark:prose-invert',
            'prose-headings:scroll-m-20',
            'prose-code:before:content-none prose-code:after:contain-none',
            'max-w-full',
          )}
        >
          <ReactMarkdown
            components={{
              h3: ({ node, ...props }) => (
                <h3 className="text-lg font-semibold" {...props} />
              ),
            }}
          >
            {note.editedContent || note.originalContent}
          </ReactMarkdown>
        </div>
      </CardContent>
    </Card>
  )
}
export default Note
