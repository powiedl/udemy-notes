import type { LucideIcon } from 'lucide-react'
import type { User } from 'better-auth'

export interface NavPrimaryProps {
  items: {
    title: string
    to: string
    icon: LucideIcon
    activeOptions: { exact: boolean }
  }[]
}

export interface NavUserProps {
  user: User
}

export interface ImportNote {
  timestamp: string
  section: string
  lecture: string
  content: string
}

export interface ImportCourse {
  title: string
  notes: ImportNote[]
}
