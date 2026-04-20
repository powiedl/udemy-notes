import { Loader2, X } from 'lucide-react'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { cn } from '#/lib/utils'

interface TagBadgeProps {
  tag: { id: string; name: string; userId?: string | null }
  onDelete?: () => void // Optionales Callback
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
  className,
  title,
  size,
  isDeleting,
  isHighlighted,
  isInherited,
  icon,
}: TagBadgeProps) => {
  const isPrivate = !!tag.userId

  return (
    <div
      className={cn(
        'relative w-fit group inline-flex',
        size === 'sm'
          ? isHighlighted
            ? 'mr-4'
            : 'mr-1' // Bei Highlight mehr Platz fürs X lassen
          : isHighlighted
            ? 'mr-5'
            : 'mr-2',
      )}
    >
      {/* group hinzugefügt für hover-effekte */}
      {/* <Badge
        variant={isPrivate ? 'secondary' : 'secondary'} // Wir überschreiben die Farbe via CN
        className={cn(
          'flex items-center uppercase gap-1 transition-all',
          size === 'sm'
            ? 'text-xxs! px-1.5 py-0 h-4 mr-1'
            : 'text-xs px-2.5 py-0.5 h-6 mr-2',

          isInherited && 'opacity-80 brightness-90',
          isHighlighted && 'ring-2 ring-lagoon-deep shadow-sm',

          // NEU: Blau für private Tags (Info-Charakter, nicht lila)
          isPrivate
            ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800'
            : 'bg-secondary text-secondary-foreground',

          isDeleting && 'opacity-50 pointer-events-none',

          className,
        )}
        title={title}
      >
        <span className="truncate max-w-40 flex flex-row gap-0.5 items-center">
          {icon}
          {tag.name}
        </span>

        {onDelete && (
          <Button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onDelete()
            }}
            className={cn(
              'absolute -top-1 rounded-full shadow-sm transition-colors border-2',
              // NEU: Standardmäßig dezent, beim Hover ROT
              'bg-background border-muted-foreground/20 text-muted-foreground',
              'hover:bg-red-500 hover:text-white hover:border-red-600 dark:hover:bg-red-600',
              size === 'sm' ? 'p-0 size-3.5' : 'p-0.5 size-5',
              isHighlighted ? '-right-2.5' : '-right-1.5',
            )}
          >
            {isDeleting ? (
              <Loader2
                className={cn(
                  'animate-spin',
                  size === 'sm' ? 'size-2.5' : 'size-3',
                )}
              />
            ) : (
              <X className={cn(size === 'sm' ? 'size-3' : 'size-3.5')} />
            )}
          </Button>
        )}
      </Badge> */}
      <Badge
        // variant={isPrivate ? 'secondary' : 'secondary'}
        variant="outline"
        className={cn(
          'inline-flex items-center uppercase gap-1 transition-all',

          // 1. GRÖSSE (ohne das statische mr)
          size === 'sm'
            ? 'text-xxs! px-1.5 py-0 h-4'
            : 'text-xs px-2.5 py-0.5 h-6',

          // 3. HIGHLIGHT RING (Bleibt jetzt immer bei 100% Leuchtkraft)
          isHighlighted && 'ring-2 ring-lagoon-deep shadow-sm',

          // 4. FARBEN & VERERBUNG (Der Trick für hellen Ring trotz dunklem Tag)
          isPrivate
            ? cn(
                'border-blue-200 dark:border-blue-800',
                isInherited
                  ? 'bg-blue-100/80 text-blue-700/80 dark:bg-blue-900/30 dark:text-blue-300/80'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
              )
            : cn(
                // DIE GLASSMORPHISMUS LÖSUNG:
                // Anstatt eines harten, deckenden Graus nutzen wir eine weiße Transparenz im Dark Mode.
                // Dadurch verschmelzen sie optisch perfekt mit dem Farbverlauf dahinter.
                isInherited
                  ? 'bg-slate-200/50 text-slate-600 dark:bg-white/5 dark:text-white/50 border-transparent'
                  : 'bg-slate-200/80 text-slate-800 dark:bg-white/10 dark:text-white/80 border-transparent',
              ),
          isDeleting && 'opacity-50 pointer-events-none',
          className,
        )}
        title={title}
      >
        <span className="truncate max-w-40 flex flex-row gap-0.5 items-center">
          {icon}
          {tag.name}
        </span>

        {onDelete && (
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
              // Rausrücken, wenn der Ring aktiv ist
              isHighlighted ? '-right-4' : '-right-1.5',
            )}
          >
            {isDeleting ? (
              <Loader2
                className={cn(
                  'animate-spin',
                  size === 'sm' ? 'size-2.5' : 'size-3',
                )}
              />
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
