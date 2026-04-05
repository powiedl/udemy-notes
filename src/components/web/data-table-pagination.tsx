import { Link } from '@tanstack/react-router'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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

  return (
    <div className="flex items-center justify-between px-2 py-4">
      <div className="flex-1 text-sm text-muted-foreground">
        Gesamt: {totalCount} Einträge
      </div>

      <div className="flex items-center space-x-2">
        {/* Erste Seite */}
        <Link
          // Wir übergeben das Ziel-Objekt direkt.
          // Durch den Spread von currentSearch behalten wir Filter wie 'search' oder 'tagIds' bei.
          search={{ ...currentSearch, page: 1 }}
          preload="intent"
          className={linkStyles(page <= 1)}
          to="."
        >
          <ChevronsLeft className="h-4 w-4" />
        </Link>

        {/* Vorherige Seite */}
        <Link
          search={{ ...currentSearch, page: Math.max(1, page - 1) }}
          preload="intent"
          className={linkStyles(page <= 1)}
          to="."
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>

        <div className="text-sm font-medium px-2">
          Seite {page} von {totalPages}
        </div>

        {/* Nächste Seite */}
        <Link
          search={{ ...currentSearch, page: Math.min(totalPages, page + 1) }}
          preload="intent"
          className={linkStyles(page >= totalPages)}
          to="."
        >
          <ChevronRight className="h-4 w-4" />
        </Link>

        {/* Letzte Seite */}
        <Link
          search={{ ...currentSearch, page: totalPages }}
          preload="intent"
          className={linkStyles(page >= totalPages)}
          to="."
        >
          <ChevronsRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}
