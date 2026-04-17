import { Link } from '@tanstack/react-router'
import { AwaitedReturnTypeGetCourseById } from '#/data/course'
import { ExtractData } from '#/types/api' // Importiere den Helper
import { cn } from '#/lib/utils'
import { Card, CardContent, CardDescription } from '../ui/card'
import ReactMarkdown from 'react-markdown'
import { BookOpenText, Link2 } from 'lucide-react'
import TagBadge from './tag-badge'
import { useTagManagement } from '#/hooks/use-tag-management' // Pfad prüfen!
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command'
import { Button } from '../ui/button'
import { Plus, Loader2, Check } from 'lucide-react'

interface NoteProps {
  note: ExtractData<AwaitedReturnTypeGetCourseById>['notes'][number] & {
    course?: { id: string; title: string }
    displayTags?: Array<{
      isInherited: boolean
      isAlsoInherited: boolean
      tag: { id: string; name: string }
    }>
  }
  showCourseLink?: boolean
}
const Note = ({ note, showCourseLink = true }: NoteProps) => {
  const {
    availableTags,
    isAdding,
    setIsAdding,
    tagQuery,
    setTagQuery,
    isPending,
    deletingTagId,
    handleLink,
    handleDeleteTagAssociation,
  } = useTagManagement(note.id, 'note', 'NoteCard')
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
        {/* Tag-Anzeige */}
        {note.displayTags && note.displayTags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {/* Interaktive Tag-Anzeige */}
            {note.displayTags && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {note.displayTags.map(
                  ({ tag, isInherited, isAlsoInherited }) => (
                    <TagBadge
                      key={`note-${note.id}-${tag.id}`}
                      tag={tag}
                      size="sm"
                      className={cn(
                        'transition-all duration-200',
                        isInherited &&
                          'opacity-70 grayscale-20 dark:opacity-90 dark:brightness-125 hover:opacity-75',
                      )}
                      title={
                        isInherited
                          ? 'Vom Kurs geerbt'
                          : isAlsoInherited
                            ? 'Direkt zugewiesen (aber ohnehin vom Kurs geerbt)'
                            : 'Direktes Tag'
                      }
                      onDelete={
                        !isInherited
                          ? () => handleDeleteTagAssociation(tag.id)
                          : undefined
                      }
                      isDeleting={deletingTagId === tag.id}
                      // NEU: Das Icon für redundante Tags
                      icon={
                        isAlsoInherited ? (
                          <Link2 className="mr-1 h-3 w-3 opacity-70" />
                        ) : undefined
                      }
                    />
                  ),
                )}

                {/* Der + Button für die Notiz */}
                <Popover open={isAdding} onOpenChange={setIsAdding}>
                  <PopoverTrigger asChild>
                    <Button
                      className="h-5 w-6 rounded-md border-dashed hover:border-primary transition-all group/add cursor-pointer"
                      variant="outline"
                      size="icon"
                      disabled={isPending}
                    >
                      {isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Plus className="h-3 w-3 opacity-70" />
                      )}
                    </Button>
                  </PopoverTrigger>

                  <PopoverContent className="w-56 p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="search tag ..."
                        value={tagQuery}
                        onValueChange={setTagQuery}
                      />
                      <CommandList>
                        <CommandEmpty className="p-2 text-xs text-muted-foreground text-center">
                          No tag found.
                        </CommandEmpty>
                        <CommandGroup>
                          {availableTags
                            // Filtern: Nur Tags anzeigen, die die Notiz noch nicht hat (weder direkt noch geerbt)
                            .filter(
                              (t) =>
                                !note.displayTags?.some(
                                  (nt) => nt.tag.id === t.id,
                                ),
                            )
                            .map((tag) => (
                              <CommandItem
                                key={tag.id}
                                onSelect={() => handleLink(tag.id)}
                                className="text-xs cursor-pointer"
                              >
                                <Check className="mr-2 h-3 w-3 opacity-0" />
                                {tag.name}
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>
        )}
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
