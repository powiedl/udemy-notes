import { Plus, Loader2, Check, Link2, CornerDownLeft } from 'lucide-react'
import { cn } from '#/lib/utils.lib'
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
  availableTags: { id: string; name: string; userId?: string }[]
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

  const exactMatchExists = availableTags.some(
    (t) => t.name.toLowerCase() === query.trim().toLowerCase() && t.userId,
  )
  const showCreateOption =
    onCreateTag && query.trim().length > 0 && !exactMatchExists

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
          tag={tag}
          size="sm"
          onDelete={
            tag.isDeletable && onRemoveTag
              ? () => onRemoveTag(tag.id)
              : undefined
          }
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
            <ActionIconButton
              actionVariant={addIconVariant === 'purple' ? 'purple' : 'outline'}
              actionSize="sm"
              className="ml-1"
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
                if (e.key === 'Enter' && showCreateOption && onCreateTag) {
                  e.preventDefault()
                  onCreateTag(query.trim())
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
                <CommandEmpty className="p-2 text-xs text-muted-foreground text-center">
                  No tag found.
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

                  {showCreateOption && (
                    <CommandItem
                      key="create-new-tag"
                      value={query}
                      onSelect={() => {
                        if (onCreateTag) {
                          onCreateTag(query.trim())
                          setQuery('')
                          setOpen(false)
                        }
                      }}
                      className={cn(
                        'flex w-full items-center mt-1 cursor-pointer transition-all rounded-md px-3 py-2',

                        'bg-primary text-primary-foreground shadow-sm',

                        'data-[selected=true]:bg-primary/90 data-[selected=true]:text-primary-foreground',
                        'active:scale-[0.98]',
                      )}
                    >
                      <div className="flex items-center min-w-0 flex-1">
                        <Plus className="mr-2 h-3.5 w-3.5 opacity-80 shrink-0" />
                        <span className="text-xs truncate">
                          <span className="opacity-70 font-light">
                            Create tag{' '}
                          </span>
                          <span className="font-semibold italic">
                            "{query}"
                          </span>
                        </span>
                      </div>

                      <div className="ml-auto flex items-center opacity-80 shrink-0 pl-3">
                        <CornerDownLeft className="h-3 w-3" />
                      </div>
                    </CommandItem>
                  )}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
