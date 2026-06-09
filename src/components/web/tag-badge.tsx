import React, { useState, useRef, useEffect } from 'react'
import { X, Check, Loader2 } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils.lib'
import { cva } from 'class-variance-authority'
import { DEFAULT_TAG_COLOR } from '#/schemas/tag.schema'
import type { TagColor } from '#/schemas/tag.schema'
import TagColorPicker from './tag-color-picker'

// 1. Die CVA Definition mit Compound Variants
export const tagBadgeVariants = cva(
  'inline-flex items-center uppercase gap-1 transition-all',
  {
    variants: {
      // "variant" vereint hier Public/Private und die Farben
      variant: {
        public:
          'bg-slate-200/80 text-slate-800 dark:bg-white/10 dark:text-white/80 border-transparent',
        blue: 'border-blue-200 dark:border-blue-800',
        cyan: 'border-cyan-200 dark:border-cyan-800', // Tailwind Amber als "Brown"
        red: 'border-red-200 dark:border-red-800',
        green: 'border-green-200 dark:border-green-800',
        yellow: 'border-yellow-200 dark:border-yellow-800',
      },
      size: {
        default: 'text-xs px-2.5 py-0.5 h-6',
        sm: 'text-xxs! px-1.5 py-0 h-4',
      },
      // Diese Boolean-Flags triggern nun CVA-Klassen
      isInherited: { true: '', false: '' },
      isHighlighted: { true: 'ring-2 ring-lagoon-deep shadow-sm' },
      isDeleting: { true: 'opacity-50 pointer-events-none' },
      isEditing: { true: 'ring-2 ring-primary/50 border-primary' },
      isSuggestion: { true: 'border-dashed' },
    },
    // HIER passiert die Magie: Die Kombination aus Farbe und Vererbung
    compoundVariants: [
      // BLUE
      {
        variant: 'blue',
        isInherited: false,
        className:
          'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
      },
      {
        variant: 'blue',
        isInherited: true,
        className:
          'bg-blue-100/80 text-blue-700/80 dark:bg-blue-900/30 dark:text-blue-300/80',
      },
      // BROWN (Amber)
      {
        variant: 'cyan',
        isInherited: false,
        className:
          'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
      },
      {
        variant: 'cyan',
        isInherited: true,
        className:
          'bg-cyan-100/80 text-cyan-700/80 dark:bg-cyan-900/30 dark:text-cyan-300/80',
      },
      // RED
      {
        variant: 'red',
        isInherited: false,
        className:
          'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
      },
      {
        variant: 'red',
        isInherited: true,
        className:
          'bg-red-100/80 text-red-700/80 dark:bg-red-900/30 dark:text-red-300/80',
      },
      // GREEN
      {
        variant: 'green',
        isInherited: false,
        className:
          'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
      },
      {
        variant: 'green',
        isInherited: true,
        className:
          'bg-green-100/80 text-green-700/80 dark:bg-green-900/30 dark:text-green-300/80',
      },
      // YELLOW
      {
        variant: 'yellow',
        isInherited: false,
        className:
          'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
      },
      {
        variant: 'yellow',
        isInherited: true,
        className:
          'bg-yellow-100/80 text-yellow-700/80 dark:bg-yellow-900/30 dark:text-yellow-300/80',
      },
    ],
    defaultVariants: {
      variant: 'public',
      size: 'default',
      isInherited: false,
      isHighlighted: false,
      isDeleting: false,
      isEditing: false,
      isSuggestion: false,
    },
  },
)

export interface TagBadgeProps {
  tag: {
    id: string
    name: string
    userId?: string | null
    color?: TagColor | null
    status?: 'APPROVED' | 'SUGGESTION'
  }
  // ... restliche Props unverändert
  className?: string
  onDelete?: () => void
  onRename?: (newName: string) => void
  onStartEdit?: () => void
  onCancelEdit?: () => void
  onApprove?: () => void
  onClick?: () => void
  onChangeColor?: (newColor: TagColor) => void
  isChangingColor?: boolean
  isEditing?: boolean
  isApproving?: boolean
  isDeleting?: boolean
  title?: string
  size?: 'default' | 'sm'
  isHighlighted?: boolean
  isInherited?: boolean
  icon?: React.ReactNode
  DeleteIcon?: React.ElementType
}

const TagBadge = ({
  tag,
  onDelete,
  onRename,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onChangeColor,
  isChangingColor,
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
  DeleteIcon = X,
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

  // Bestimme die CVA Variante ("public" oder die konkrete Farbe, Fallback "blue")
  const badgeVariant: TagColor | 'public' = isPrivate
    ? tag.color || DEFAULT_TAG_COLOR
    : 'public'

  // Das cn() ist jetzt massiv aufgeräumt
  const badgeClassName = cn(
    tagBadgeVariants({
      variant: badgeVariant, // Casten für TypeScript
      size,
      isInherited: !!isInherited,
      isHighlighted: !!isHighlighted,
      isDeleting: !!isDeleting,
      isEditing: !!isEditing,
      isSuggestion: !!isSuggestion,
    }),
    // Sehr spezifische Edge-Cases, die in CVA schwer abzubilden sind, bleiben hier:
    isSuggestion && !onApprove && 'border-[3px]',
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
    if (isEditing || isChangingColor) return

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

  const currentTagColor = (tag.color as TagColor) || DEFAULT_TAG_COLOR

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
              <DeleteIcon className="size-3.5" />
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
      {typeof onChangeColor === 'function' &&
        !isEditing &&
        !isSuggestion &&
        isPrivate && (
          <TagColorPicker
            currentColor={currentTagColor}
            onColorChange={onChangeColor}
            disabled={isDeleting || isApproving} // ggf. auch isChangingColor hier rein
          />
        )}
    </div>
  )
}

export default TagBadge
