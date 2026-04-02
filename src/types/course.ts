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
