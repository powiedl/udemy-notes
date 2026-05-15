import { Plus, Loader2, Check, Link2, CornerDownLeft } from 'lucide-react'
import { cn } from '#/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command'
import TagBadge from './tag-badge'
import { useState } from 'react'
import { ActionIconButton } from '../ui/action-icon-button'

export interface TagDisplay {
  id: string
  name: string
  userId?: string | null
  status?: 'APPROVED' | 'SUGGESTION'
  isInherited?: boolean
  isDeletable?: boolean
  isHighlighted?: boolean
  tooltip?: string
}

interface TagManagerProps {
  tags: TagDisplay[]
  availableTags: { id: string; name: string }[]
  onAddTag?: (id: string) => void
  onRemoveTag?: (id: string) => void
  onCreateTag?: (name: string) => void
  onApproveTag?: (id: string) => void
  isPending?: boolean
  deletingTagId?: string | null
  approvingTagId?: string | null
  className?: string
  addIconVariant?: 'purple' | 'default'
}

export function TagManager({
  tags,
  availableTags,
  onAddTag,
  onRemoveTag,
  onCreateTag,
  onApproveTag,
  isPending,
  deletingTagId,
  approvingTagId,
  className,
  addIconVariant = 'default',
}: TagManagerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  return (
    <div
      className={cn('flex flex-wrap gap-1.5 mt-1.5 items-center', className)}
    >
      {tags.length === 0 && (onAddTag || onCreateTag) && (
        <span className="text-muted-foreground">add a tag</span>
      )}
      {tags.map((tag) => (
        <TagBadge
          key={tag.id}
          tag={tag} // TagBadge liest jetzt tag.status automatisch aus!
          size="sm"
          onDelete={
            tag.isDeletable && onRemoveTag
              ? () => onRemoveTag(tag.id)
              : undefined
          }
          // NEU: Approve-Handler weiterreichen
          onApprove={
            tag.status === 'SUGGESTION' && onApproveTag
              ? () => onApproveTag(tag.id)
              : undefined
          }
          isApproving={approvingTagId === tag.id}
          isDeleting={deletingTagId === tag.id}
          title={tag.tooltip}
          isHighlighted={tag.isHighlighted}
          icon={
            tag.isInherited ? (
              <Link2 className="mr-1 h-3 w-3 opacity-70" />
            ) : undefined
          }
        />
      ))}

      {(onAddTag || onRemoveTag || onCreateTag) && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            {/* <Button
              type="button"
              // Wir steuern die Basis-Farben über den Variant,
              // aber wir zwingen unseren EIGENEN Hover-Effekt auf.
              variant={addIconVariant === 'purple' ? 'default' : 'outline'}
              size="icon"
              disabled={isPending}
              title="add a tag"
              className={cn(
                // Basis-Klassen (Form, Abstand, Transition)
                'h-4 w-6 rounded-md transition-all duration-200 cursor-pointer ml-1',

                // Bedingte Klassen basierend auf der Variante
                addIconVariant === 'purple'
                  ? [
                      // Wir deaktivieren den Shadcn-Hover, indem wir den Background fix auf primary setzen (auch beim Hover)
                      'bg-primary hover:bg-primary border-transparent shadow-sm',
                      // Stattdessen machen wir den Button beim Hover leicht durchscheinend
                      // ODER wir nutzen brightness, aber ohne den störenden Hintergrund-Wechsel
                      'hover:brightness-110 active:scale-95',
                    ]
                  : 'border-dashed hover:border-primary',
              )}
            >
              {isPending ? (
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
              ) : (
                <Plus
                  className={cn(
                    'h-3 w-3 transition-opacity duration-200',
                    // Im Purple-Modus machen wir das Plus beim Hovern zu 100% sichtbar (leuchtend), sonst 70%
                    addIconVariant === 'purple'
                      ? 'opacity-80 hover:opacity-100'
                      : 'opacity-60 hover:opacity-100',
                  )}
                  strokeWidth={addIconVariant === 'purple' ? 2.5 : 2} // Purple darf ruhig etwas kräftiger sein
                />
              )}
            </Button> */}
            <ActionIconButton
              actionVariant={addIconVariant === 'purple' ? 'purple' : 'outline'}
              actionSize="sm"
              className="ml-1" // Den Abstand fügen wir spezifisch hier hinzu
              disabled={isPending}
              title="add a tag"
            >
              {isPending ? (
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
              ) : (
                <Plus
                  className={cn(
                    'h-3 w-3 transition-opacity duration-200',
                    addIconVariant === 'purple'
                      ? 'opacity-80 hover:opacity-100'
                      : 'opacity-60 hover:opacity-100',
                  )}
                  strokeWidth={addIconVariant === 'purple' ? 2.5 : 2}
                />
              )}
            </ActionIconButton>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            <Command
              onKeyDown={(e) => {
                // Enter-Logik für neues Tag
                if (
                  e.key === 'Enter' &&
                  query.length > 0 &&
                  onCreateTag &&
                  !availableTags.some((t) => t.name === query)
                ) {
                  onCreateTag(query)
                  setQuery('')
                  setOpen(false)
                }
              }}
            >
              <CommandInput
                placeholder="search tag ..."
                value={query}
                onValueChange={setQuery}
              />
              <CommandList>
                <CommandEmpty className="p-1">
                  {/* Dein schöner Create-Button, wenn nichts gefunden wurde */}
                  {query.length > 0 && onCreateTag ? (
                    <button
                      type="button"
                      className={cn(
                        'flex w-full items-center justify-between px-3 py-2 rounded-md transition-all',
                        'bg-primary text-primary-foreground shadow-sm',
                        'hover:bg-primary/90 cursor-pointer active:scale-[0.98]',
                      )}
                      onClick={() => {
                        onCreateTag(query)
                        setQuery('')
                        setOpen(false)
                      }}
                    >
                      <Plus className="mr-2 h-3.5 w-3.5 opacity-80" />
                      <span className="text-xs truncate mr-2">
                        <span className="opacity-70 font-light">
                          Create tag{' '}
                        </span>
                        <span className="font-semibold italic">"{query}"</span>
                      </span>
                      <div className="flex items-center gap-1 opacity-80 shrink-0">
                        <CornerDownLeft className="h-3 w-3" />
                      </div>
                    </button>
                  ) : (
                    <div className="p-2 text-xs text-muted-foreground text-center">
                      No tag found.
                    </div>
                  )}
                </CommandEmpty>
                <CommandGroup>
                  {availableTags
                    .filter(
                      (t) => !tags.some((existing) => existing.id === t.id),
                    )
                    .map((tag) => (
                      <CommandItem
                        key={tag.id}
                        onSelect={() => {
                          onAddTag && onAddTag(tag.id)
                          setQuery('')
                          setOpen(false)
                        }}
                        className="text-xs cursor-pointer hover:bg-accent hover:text-accent-foreground"
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
      )}
    </div>
  )
}
