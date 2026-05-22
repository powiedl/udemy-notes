import React, { useState, useRef, useEffect } from 'react'
import { X, Check, Loader2 } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils.lib'

export interface TagBadgeProps {
  tag: {
    id: string
    name: string
    userId?: string | null
    status?: 'APPROVED' | 'SUGGESTION'
  }
  className?: string
  onDelete?: () => void
  onRename?: (newName: string) => void
  onStartEdit?: () => void
  onCancelEdit?: () => void
  onApprove?: () => void
  onClick?: () => void // Der Handler für externe Links
  isEditing?: boolean
  isApproving?: boolean
  isDeleting?: boolean
  title?: string
  size?: 'default' | 'sm'
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
  onApprove,
  isApproving,
  onClick,
}: TagBadgeProps) => {
  const isPrivate = !!tag.userId
  const isSuggestion = tag.status === 'SUGGESTION'
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
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      setTempName(tag.name)
      onCancelEdit?.()
    }
  }

  const badgeClassName = cn(
    'inline-flex items-center uppercase gap-1 transition-all',
    size === 'sm' ? 'text-xxs! px-1.5 py-0 h-4' : 'text-xs px-2.5 py-0.5 h-6',
    isHighlighted && 'ring-2 ring-lagoon-deep shadow-sm',

    isSuggestion && 'border-dashed',
    isSuggestion && !onApprove && 'border-[3px]',
    isPrivate
      ? cn(
          'border-blue-200 dark:border-blue-800',
          isInherited
            ? 'bg-blue-100/80 text-blue-700/80 dark:bg-blue-900/30 dark:text-blue-300/80'
            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
        )
      : 'bg-slate-200/80 text-slate-800 dark:bg-white/10 dark:text-white/80 border-transparent',

    isDeleting && 'opacity-50 pointer-events-none',
    isEditing && 'ring-2 ring-primary/50 border-primary',
    className,
  )

  const divMr =
    size === 'sm'
      ? isHighlighted
        ? 'mr-4'
        : 'mr-1'
      : isHighlighted
        ? 'mr-5'
        : 'mr-3'
  const divMl = isSuggestion ? (size === 'sm' ? 'ml-1.5' : 'ml-2.5') : ''

  const xRight =
    size === 'sm'
      ? isHighlighted
        ? '-right-4'
        : '-right-1.5'
      : isHighlighted
        ? '-right-5'
        : '-right-2.5'
  const checkLeft = size === 'sm' ? '-left-1.5' : '-left-2.5'

  const handleBadgeClick = () => {
    if (isEditing) return

    // Wenn ein externer Link hinterlegt ist
    if (onClick) {
      onClick()
      return
    }

    // Wenn es sich um ein privates Tag handelt, das umbenannt werden darf
    if (isPrivate && !isSuggestion && onStartEdit) {
      onStartEdit()
    }
  }

  const isClickable =
    !!onClick || (isPrivate && !!onRename && !isEditing && !isSuggestion)

  return (
    <div
      className={cn(
        'relative w-fit group inline-flex',
        divMr,
        divMl,
        isClickable && 'cursor-pointer',
      )}
      onClick={handleBadgeClick}
    >
      <Badge variant="outline" className={badgeClassName} title={title}>
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
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            tag.name
          )}
        </span>

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
              'bg-background border-muted-foreground/20 text-muted-foreground hover:bg-red-500 hover:text-white hover:border-red-600 dark:hover:bg-red-600',
              size === 'sm' ? 'p-0 size-3.5' : 'p-0.5 size-5',
              xRight,
            )}
            title={isSuggestion ? 'reject suggestion' : 'remove tag'}
          >
            {isDeleting ? (
              <Loader2 className="animate-spin size-3" />
            ) : (
              <X className="size-3.5" />
            )}
          </Button>
        )}

        {isSuggestion && typeof onApprove === 'function' && !isEditing && (
          <Button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onApprove()
            }}
            className={cn(
              'absolute -top-1 rounded-full shadow-sm transition-colors border-2 cursor-pointer',
              'bg-background border-green-200 text-green-600',
              'hover:bg-green-500 hover:text-white hover:border-green-500 dark:border-green-900',
              size === 'sm' ? 'p-0 size-3.5' : 'p-0.5 size-5',
              checkLeft,
            )}
            title="accept tag"
          >
            {isApproving ? (
              <Loader2 className="animate-spin size-3" />
            ) : (
              <Check className="size-3.5" />
            )}
          </Button>
        )}
      </Badge>
    </div>
  )
}

export default TagBadge
