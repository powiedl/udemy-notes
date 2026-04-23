import { Loader2, X } from 'lucide-react'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { cn } from '#/lib/utils'
import React, { useEffect, useRef, useState } from 'react'

interface TagBadgeProps {
  tag: { id: string; name: string; userId?: string | null }
  onDelete?: () => void // Optionales Callback
  onRename?: (newName: string) => void // NEU: Callback für Rename
  isEditing?: boolean // NEU: Status von außen gesteuert
  onStartEdit?: () => void // NEU: Trigger zum Starten
  onCancelEdit?: () => void // NEU: Trigger zum Abbrechen
  className?: string
  title?: string
  size?: 'default' | 'sm'
  isDeleting?: boolean
  isHighlighted?: boolean
  isInherited?: boolean
  icon?: React.ReactNode
}
const TagBadge = ({
  tag,
  onDelete,
  onRename,
  isEditing,
  onStartEdit,
  onCancelEdit,
  className,
  title,
  size,
  isDeleting,
  isHighlighted,
  isInherited,
  icon,
}: TagBadgeProps) => {
  const isPrivate = !!tag.userId
  const [tempName, setTempName] = useState(tag.name)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isEditing])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // Wir rufen NICHT onRename auf.
      // Wir nehmen dem Feld den Fokus, was automatisch onBlur triggert.
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      setTempName(tag.name)
      onCancelEdit?.()
    }
  }
  // console.log(
  //   'DEBUG: onDelete type is:',
  //   typeof onDelete,
  //   'Value is:',
  //   onDelete,
  // )

  return (
    <div
      className={cn(
        'relative w-fit group inline-flex',
        size === 'sm'
          ? isHighlighted
            ? 'mr-4'
            : 'mr-1'
          : isHighlighted
            ? 'mr-5'
            : 'mr-2',
        // Cursor-Hand nur wenn privat und Rename-Funktion vorhanden
        isPrivate && onRename && !isEditing && 'cursor-pointer',
      )}
      onClick={() => !isEditing && isPrivate && onStartEdit?.()}
    >
      <Badge
        variant="outline"
        className={cn(
          'inline-flex items-center uppercase gap-1 transition-all',
          size === 'sm'
            ? 'text-xxs! px-1.5 py-0 h-4'
            : 'text-xs px-2.5 py-0.5 h-6',
          isHighlighted && 'ring-2 ring-lagoon-deep shadow-sm',
          isPrivate
            ? cn(
                'border-blue-200 dark:border-blue-800',
                isInherited
                  ? 'bg-blue-100/80 text-blue-700/80 dark:bg-blue-900/30 dark:text-blue-300/80'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
              )
            : 'bg-slate-200/80 text-slate-800 dark:bg-white/10 dark:text-white/80 border-transparent',
          isDeleting && 'opacity-50 pointer-events-none',
          isEditing && 'ring-2 ring-primary/50 border-primary', // Visual Feedback für Editing
          className,
        )}
        title={title}
      >
        <span className="truncate max-w-40 flex flex-row gap-0.5 items-center">
          {icon}
          {isEditing ? (
            <input
              ref={inputRef}
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => onRename?.(tempName)}
              className="bg-transparent border-none outline-none w-full min-w-12.5 uppercase font-semibold"
              onClick={(e) => e.stopPropagation()} // Verhindert Doppelklick-Issues
            />
          ) : (
            tag.name
          )}
        </span>

        {/* Delete Button - Nur anzeigen wenn NICHT editiert wird */}
        {typeof onDelete === 'function' && !isEditing && (
          <Button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onDelete()
            }}
            className={cn(
              'absolute -top-1 rounded-full shadow-sm transition-colors border-2 cursor-pointer',
              'bg-background border-muted-foreground/20 text-muted-foreground',
              'hover:bg-red-500 hover:text-white hover:border-red-600 dark:hover:bg-red-600',
              size === 'sm' ? 'p-0 size-3.5' : 'p-0.5 size-5',
              isHighlighted ? '-right-4' : '-right-1.5',
            )}
          >
            {isDeleting ? (
              <Loader2 className="animate-spin size-3" />
            ) : (
              <X className="size-3.5" />
            )}
          </Button>
        )}
      </Badge>
    </div>
  )
}

export default TagBadge
