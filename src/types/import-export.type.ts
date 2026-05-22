export type AnalysisResult = {
  parsedCourse: {
    courseTitle: string
    courseDescription?: string
    courseUrl?: string
    imageUrl?: string
    trainerUrl?: string
    notes: {
      section: string
      lecture: string
      timestamp: string
      content: string
    }[]
    notesCount: number
  }
  trainerMatch: {
    url?: string
    isKnown: boolean
    existingCoursesCount: number
    nameInDb?: string
  }
}
