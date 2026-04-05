import { useEffect, useState } from 'react'
import { Input } from '../ui/input'

interface DataTableSearchProps {
  value?: string
  onSearchChange: (value: string) => void
}

export function DataTableSearch({
  value = '',
  onSearchChange,
}: DataTableSearchProps) {
  const [localSearch, setLocalSearch] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => onSearchChange(localSearch), 400)
    return () => clearTimeout(timer)
  }, [localSearch])

  return (
    <Input
      placeholder="Suchen..."
      value={localSearch}
      onChange={(e) => setLocalSearch(e.target.value)}
    />
  )
}
