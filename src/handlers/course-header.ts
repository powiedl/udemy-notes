import { exportMdFile } from '#/data/import-export'
import { toast } from 'sonner'

export const handleExportCourse = async (id: string): Promise<void> => {
  try {
    toast.loading('Markdown wird generiert...')

    // 1. Server Function aufrufen
    const result = await exportMdFile({
      data: {
        courseId: id,
        includeNotesMetadata: true,
        includeTags: true,
        includeOriginalNote: true,
      }, // Input entsprechend deinem Schema
    })

    if (!result.success || !result.markdown) {
      throw new Error('Export fehlgeschlagen')
    }

    // 2. Blob aus dem Markdown-String erstellen
    const blob = new Blob([result.markdown], { type: 'text/markdown' })

    // 3. Temporäre URL für den Blob erstellen
    const url = window.URL.createObjectURL(blob)

    // 4. "Unsichtbaren" Link erstellen und klicken
    const link = document.createElement('a')
    link.href = url

    // Dateiname generieren (optional: Kursname einbeziehen)
    link.download = `course-export-${id}.md`

    document.body.appendChild(link)
    link.click()

    // 5. Cleanup
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)

    toast.dismiss()
    toast.success('Download gestartet!')
  } catch (error) {
    toast.dismiss()
    toast.error('Error during export of the course notes')
  }
}
export const handleDeleteCourse = (id: string): void => {
  alert(`Delete course - ${id}`)
}
