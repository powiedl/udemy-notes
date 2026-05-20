import { Link } from '@tanstack/react-router'
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn, normalizeObject } from '@/lib/utils.lib'

interface DataTablePaginationProps {
  totalCount: number
  pageSize: number
  page: number
  // Wir nehmen die aktuellen Suchparameter als "Blackbox" entgegen
  currentSearch: Record<string, any>
}

export function DataTablePagination({
  totalCount,
  pageSize,
  page,
  currentSearch,
}: DataTablePaginationProps) {
  const totalPages = Math.ceil(totalCount / pageSize)

  const linkStyles = (disabled: boolean) =>
    cn(
      buttonVariants({ variant: 'outline', size: 'icon' }),
      disabled && 'pointer-events-none opacity-50',
    )
  const chevronClass = 'h-4 w-4'

  return (
    <div
      className={cn(
        totalPages <= 1
          ? 'hidden'
          : 'flex items-center justify-between px-2 py-4',
      )}
    >
      <div className="flex-1 text-sm text-muted-foreground">
        Total: {totalCount} entr{totalCount === 1 ? 'y' : 'ies'}
      </div>

      <div className="flex items-center space-x-2">
        {/* Erste Seite */}
        <Link
          // Wir übergeben das Ziel-Objekt direkt.
          // Durch den Spread von currentSearch behalten wir Filter wie 'search' oder 'tagIds' bei.
          search={normalizeObject({ ...currentSearch, page: 1 })}
          preload="intent"
          className={linkStyles(page <= 1)}
          to="."
        >
          <ChevronFirst className={chevronClass} />
        </Link>

        {/* Vorherige Seite */}
        <Link
          search={normalizeObject({
            ...currentSearch,
            page: Math.max(1, page - 1),
          })}
          preload="intent"
          className={linkStyles(page <= 1)}
          to="."
        >
          <ChevronLeft className={chevronClass} />
        </Link>

        <div className="text-sm font-medium px-2">
          {page} / {totalPages}
        </div>

        {/* Nächste Seite */}
        <Link
          search={normalizeObject({
            ...currentSearch,
            page: Math.min(totalPages, page + 1),
          })}
          preload="intent"
          className={linkStyles(page >= totalPages)}
          to="."
        >
          <ChevronRight className={chevronClass} />
        </Link>

        {/* Letzte Seite */}
        <Link
          search={normalizeObject({ ...currentSearch, page: totalPages })}
          preload="intent"
          className={linkStyles(page >= totalPages)}
          to="."
        >
          <ChevronLast className={chevronClass} />
        </Link>
      </div>
    </div>
  )
}
