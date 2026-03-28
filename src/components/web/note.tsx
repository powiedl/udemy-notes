import { AwaitedReturnTypeGetCourseById } from '#/data/course'
import { cn } from '#/lib/utils'
import { Badge, Tag } from 'lucide-react'
import { Card, CardContent, CardDescription } from '../ui/card'
import ReactMarkdown, { MarkdownAsync } from 'react-markdown'

const Note = ({
  note,
}: {
  note: AwaitedReturnTypeGetCourseById['notes'][number]
}) => {
  // mit MyArrayType[number] erhält man den Typ eines einzelnen Elements in dem Array
  return (
    <Card className="relative">
      <CardDescription className="px-2 py-1 flex flex-col gap-y-0.5">
        <h2 className="text-xl font-semibold">{note.section}</h2>
        <h3 className="text-lg">{note.lecture}</h3>
      </CardDescription>
      <span className="border-2 border-ring rounded-lg px-2 py-0.5 my-1 font-semibold absolute right-0 top-0 m-2">
        {note.timestamp}
      </span>
      <CardContent className="single-note bg-accent px-2 py-1">
        <div
          className={cn(
            'prose prose-stone dark:prose-invert',
            'prose-headings:scroll-m-20',
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
