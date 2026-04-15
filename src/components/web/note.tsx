import { Link } from '@tanstack/react-router'
import { AwaitedReturnTypeGetCourseById } from '#/data/course'
import { ExtractData } from '#/types/api' // Importiere den Helper
import { cn } from '#/lib/utils'
import { Card, CardContent, CardDescription } from '../ui/card'
import ReactMarkdown from 'react-markdown'
import { BookOpenText } from 'lucide-react'

interface NoteProps {
  note: ExtractData<AwaitedReturnTypeGetCourseById>['notes'][number] & {
    course?: { id: string; title: string }
  }
  showCourseLink?: boolean
}
const Note = ({ note, showCourseLink = true }: NoteProps) => {
  // mit MyArrayType[number] erhält man den Typ eines einzelnen Elements in dem Array
  return (
    <Card className="relative pt-12">
      {/* Schwebend Oben Links */}
      {showCourseLink && note.course && (
        <Link
          to="/courses/$courseId"
          params={{ courseId: note.course.id }}
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
