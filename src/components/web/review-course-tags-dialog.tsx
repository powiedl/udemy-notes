// src/components/web/review-course-tags-dialog.tsx
import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { Loader2, Sparkles, Check, X } from 'lucide-react'
import { cn } from '#/lib/utils.lib'

export type AITagSuggestionForDialog = {
  name: string
  isNew: boolean
  isPrivate?: boolean
}

interface ReviewCourseTagsDialogProps {
  tags: AITagSuggestionForDialog[] | null
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSave: (selectedTagNames: string[]) => void
  isSaving: boolean
}

export function ReviewCourseTagsDialog({
  tags,
  isOpen,
  onOpenChange,
  onSave,
  isSaving,
}: ReviewCourseTagsDialogProps) {
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())

  // Standardmäßig alle von der KI vorgeschlagenen Tags anwählen
  useEffect(() => {
    if (tags) {
      setSelectedTags(new Set(tags.map((t) => t.name)))
    }
  }, [tags])

  const toggleTag = (tagName: string) => {
    const newSelected = new Set(selectedTags)
    if (newSelected.has(tagName)) {
      newSelected.delete(tagName)
    } else {
      newSelected.add(tagName)
    }
    setSelectedTags(newSelected)
  }

  const handleSave = () => {
    onSave(Array.from(selectedTags))
  }

  if (!tags) return null

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Suggested Course Tags
          </DialogTitle>
          <DialogDescription>
            <p>
              Select the tags you want to apply to this course. Unselect the
              ones that don't fit.
            </p>
            <p>
              The notes of this course will also get tag suggestions, which you
              can approve afterwards (by clicking the{' '}
              <Check
                className="size-3.5 inline brightness-150"
                strokeWidth={3}
              />
              ) or remove (by clicking the{' '}
              <X className="size-3.5 inline brightness-150" strokeWidth={3} />)
              at the tag in the header of each note).
            </p>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 py-4">
          {tags.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              The AI couldn't find any relevant tags.
            </p>
          ) : (
            tags.map((tag) => {
              const isSelected = selectedTags.has(tag.name)
              const isPrivate = tag.isPrivate

              // Exakte Styling-Logik aus deiner TagBadge-Komponente übernommen
              const badgeClassName = cn(
                'inline-flex items-center uppercase gap-1 transition-all text-xs px-2.5 py-0.5 h-6 cursor-pointer select-none',
                // isHighlighted (Neuer Tag)
                tag.isNew && 'ring-2 ring-lagoon-deep shadow-sm',
                // Privat vs. Global
                isPrivate
                  ? 'border-blue-200 dark:border-blue-800 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'bg-slate-200/80 text-slate-800 dark:bg-white/10 dark:text-white/80 border-transparent',
                // Ausgegraut, wenn abgewählt
                !isSelected && 'opacity-40 hover:opacity-60 grayscale',
              )

              return (
                <Badge
                  key={tag.name}
                  variant="outline"
                  className={badgeClassName}
                  onClick={() => toggleTag(tag.name)}
                >
                  {isSelected && <Check className="size-3 mr-0.5" />}
                  {tag.name}
                  {tag.isNew && (
                    <span className="ml-0.5 text-[10px] font-normal opacity-70">
                      (Neu)
                    </span>
                  )}
                </Badge>
              )
            })
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
            className="cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving || selectedTags.size === 0}
            className="cursor-pointer"
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save {selectedTags.size} Tag{selectedTags.size !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
