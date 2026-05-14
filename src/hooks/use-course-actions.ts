import { useServerFn } from '@tanstack/react-start'
import { exportMdFile } from '#/data/import-export'
import { createShareLinkFn, deleteCourseByIdFn } from '#/data/course'
import { handleAction } from '#/lib/client-utils'
import { useRouter } from '@tanstack/react-router'
import type { ExportMdFileSchema } from '#/schemas/export-file'

export function useCourseActions() {
  const router = useRouter()
  // Wir sagen dem Hook explizit, welches Schema die Funktion hat
  const exportFn = useServerFn<typeof exportMdFile>(exportMdFile)
  const deleteFn = useServerFn<typeof deleteCourseByIdFn>(deleteCourseByIdFn)
  const shareFn = useServerFn<typeof createShareLinkFn>(createShareLinkFn)

  const handleDelete = async (id: string) => {
    try {
      // Wir übergeben das Promise, das deleteFn() zurückgibt, an handleAction
      await handleAction(
        deleteFn({
          data: {
            id,
            loggingMetadata: {
              component: 'CourseCard',
              actionSource: 'DeleteButton',
            },
          },
        }),
        { successToast: 'Kurs erfolgreich gelöscht' },
      )
      await router.invalidate()
    } catch (error) {
      // Der Fehler wurde bereits von handleAction via Toast gemeldet.
      // Hier fangen wir ihn nur ab, damit der Hook nicht abstürzt.
      // console.error('Löschvorgang abgebrochen:', error)
    }
  }
  const handleShare = async (id: string) => {
    // console.log('handleShare,courseId:', id)
    try {
      const result = await handleAction(
        shareFn({
          data: {
            courseId: id,
            loggingMetadata: {
              component: 'CourseHeader',
              actionSource: 'ShareButton',
            },
          },
        }),
        { successToast: 'Link to this course saved in the clipboard' },
      )
      // window.location.origin holt sich dynamisch das Protokoll und die Domain (z.B. http://localhost:3000)
      const absoluteLink = `${window.location.origin}/share-public/${result.token}`

      await navigator.clipboard.writeText(absoluteLink)
      // console.log('Share Link:', absoluteLink)
    } catch (e: any) {}
  }
  const handleExport = async (data: ExportMdFileSchema) => {
    try {
      // Hier rufen wir die Funktion auf.
      // WICHTIG: Das 'await' stellt sicher, dass result den Rückgabetyp der Server Fn hat
      const {
        courseId,
        includeCourseTags,
        includeNoteTags,
        includeNotesMetadata,
        includeTrainers,
        noteVersion,
      } = data
      // console.log('use-course-actions,data:', data)
      const result = await handleAction(
        exportFn({
          data: {
            courseId,
            includeNotesMetadata,
            includeCourseTags,
            includeTrainers,
            includeNoteTags,
            noteVersion,
            loggingMetadata: {
              component: 'CourseHeader',
              actionSource: 'ExportButton',
            },
          },
        }),
        { successToast: 'Course exported successfully', showErrorToast: true },
      )

      // if (!result) {
      //   throw new Error('Server lieferte keine Antwort')
      // }

      // ERFOLGSFALL: result.data.markdown ist jetzt sicher verfügbar
      const markdownContent = result.markdown

      const blob = new Blob([markdownContent], { type: 'text/markdown' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `course-${courseId}.md`
      document.body.appendChild(link)
      link.click()

      // Cleanup
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (e: any) {
      // console.error('Export Error:', e)
    }
  }

  return { handleExport, handleDelete, handleShare }
}
