import { useEffect, useState } from 'react'
import { Input } from '../ui/input'

interface DataTableSearchProps {
  value?: string
  children?: React.ReactNode
  placeholder?: string
  onSearchChange: (value: string) => void
}

export function DataTableSearch({
  value = '',
  children,
  placeholder = 'Search...',
  onSearchChange,
}: DataTableSearchProps) {
  const [localSearch, setLocalSearch] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => onSearchChange(localSearch), 400)
    return () => clearTimeout(timer)
  }, [localSearch])

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full">
      <Input
        placeholder={placeholder}
        value={localSearch}
        onChange={(e) => setLocalSearch(e.target.value)}
      />
      {children && (
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {children}
        </div>
      )}
    </div>
  )
}
