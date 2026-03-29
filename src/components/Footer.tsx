import { cn } from '#/lib/utils'

export default function Footer({ className = '' }: { className?: string }) {
  // const year = new Date().getFullYear()
  return (
    <footer
      className={cn(
        'border-t border-(--line) p-4 text-(--sea-ink-soft)',
        className,
      )}
    >
      <div className="flex flex-col items-center justify-between gap-4 text-center sm:text-left">
        <p className="mt-0 text-sm">&copy; 2026 Roland</p>
      </div>
    </footer>
  )
}
