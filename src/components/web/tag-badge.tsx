import { deleteTagFn, getAvailableTagsFn } from '#/data/tag'
import { ClientLoggingMetadata, ServerFnData } from '#/types/api'
import { Loader2, X } from 'lucide-react'
import { Badge } from '../ui/badge'
import { useServerFn } from '@tanstack/react-start'
import { useTransition } from 'react'
import { Button } from '../ui/button'
import { cn } from '#/lib/utils'
import { handleAction } from '#/lib/client-utils'

interface TagBadgeProps {
  tag: { id: string; name: string; userId?: string | null }
  onDelete?: () => void // Optionales Callback
  className?: string
  size?: 'default' | 'sm'
  isDeleting?: boolean
}
const TagBadge = ({
  tag,
  onDelete,
  className,
  size,
  isDeleting,
}: TagBadgeProps) => {
  const isPrivate = !!tag.userId
  // tag.id === 'tt2' &&
  //   console.log('TagBadge, mein tag,isPrivate', tag, isPrivate)

  return (
    <div className="relative w-fit">
      <Badge
        variant={isPrivate ? 'default' : 'secondary'}
        className={cn(
          'flex items-center uppercase gap-1 transition-all',
          // --- Größen-Mapping ---
          size === 'sm'
            ? 'text-xxs! px-1.5 py-0 h-4 mr-1' // Dein spezial-kleiner Style für den Header
            : 'text-xs px-2.5 py-0.5 h-6 mr-2', // Standard-Style für die /tags Route

          // Private Tags visuell abheben
          isPrivate && 'border-primary/50',
          isDeleting && 'opacity-50 pointer-events-none',
          className,
        )}
      >
        <span className="truncate max-w-40">{tag.name}</span>

        {onDelete && (
          <Button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onDelete()
            }}
            className={cn(
              'absolute -right-1 -top-1 rounded-full bg-background shadow-sm group overflow-visible hover:cursor-pointer border-2 dark:bg-muted dark:border-muted-foreground/50',
              size === 'sm' ? 'p-0 size-3.5' : 'p-0.5 size-5',
            )}
          >
            {isDeleting ? (
              <Loader2 className={cn(size === 'sm' ? 'size-2.5' : 'size-3')} />
            ) : (
              <X className={cn(size === 'sm' ? 'size-3' : 'size-3.5')} />
            )}
          </Button>
        )}
      </Badge>
    </div>
  )
}

export default TagBadge
