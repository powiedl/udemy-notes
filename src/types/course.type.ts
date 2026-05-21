export interface ImportNote {
  timestamp: string
  section: string
  lecture: string
  content: string
}

export interface ImportCourse {
  title: string
  description?: string
  imageUrl?: string
  courseUrl?: string
  trainerUrl?: string
  notes: ImportNote[]
}
