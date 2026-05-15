import { linkTagToCourseFn, removeTagFromCourseFn } from '#/data/course'
import { toggleNoteTagFn } from '#/data/note'
import { createAndLinkTagToTargetFn } from '#/data/tag'
import { handleAction } from '#/lib/client-utils'
import type { ClientLoggingMetadata } from '#/schemas/api-utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState, useTransition } from 'react'
import { tagsQueryOptions } from '#/routes/_content/route'

export function useTagManagement(
  targetId: string,
  targetType: 'course' | 'note',
  componentName: string,
  readOnly: boolean = false,
) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: availableTags = [] } = useQuery({
    ...tagsQueryOptions,
    enabled: !readOnly,
  })

  // STATES
  const [isAdding, setIsAdding] = useState(false)
  const [tagQuery, setTagQuery] = useState('')
  // const [availableTags, setAvailableTags] = useState<any[]>([])
  const [deletingTagId, setDeletingTagId] = useState<string | null>(null)

  // TRANSITIONS
  const [isPending, startTransition] = useTransition()

  // Server Fns wrappen...
  const linkTagToCourse = useServerFn(linkTagToCourseFn)
  const removeTagFromCourse = useServerFn(removeTagFromCourseFn)
  const createAndLinkTagToTarget = useServerFn(createAndLinkTagToTargetFn)
  const toggleNoteTag = useServerFn(toggleNoteTagFn)

  // Metadatan für das withLogging Schema
  const loggingMetadata: ClientLoggingMetadata = {
    component: componentName,
    actionSource: 'TagManagement Hook',
  }

  const handleLink = async (tagId: string) => {
    if (readOnly) return
    startTransition(async () => {
      if (targetType === 'course') {
        await handleAction(
          linkTagToCourse({
            data: {
              courseId: targetId,
              tagId,
              loggingMetadata: { component: componentName },
            },
          }),
          { showErrorToast: true },
        )
      } else {
        ;(await handleAction(
          toggleNoteTag({ data: { noteId: targetId, tagId, action: 'add' } }),
        ),
          { showErrorToast: true })
      }
      setIsAdding(false) // die Shadcn-Ui Komponente Popover kümmert sich um das isAdding=true
      setTagQuery('')
      router.invalidate()
    })
  }

  // handleRemove, handleCreateAndLink analog...
  const handleCreateAndLink = async (tagName: string) => {
    if (readOnly) return
    if (!tagName.trim()) return

    startTransition(async () => {
      const result = await handleAction(
        createAndLinkTagToTarget({
          data: {
            targetId,
            targetType,
            tagName,
            loggingMetadata: { component: 'CourseHeader' },
          },
        }),
        { successToast: 'New tag created and linked', showErrorToast: true },
      )

      if (result.success) {
        await queryClient.invalidateQueries({ queryKey: ['availableTags'] })
        setIsAdding(false) // die Shadcn-Ui Komponente Popover kümmert sich um das isAdding=true
        setTagQuery('')
        router.invalidate()
      }
    })
  }

  const handleDeleteTagAssociation = async (tagId: string) => {
    if (readOnly) return
    setDeletingTagId(tagId)
    startTransition(async () => {
      try {
        if (targetType === 'course') {
          await handleAction(
            removeTagFromCourse({
              data: { courseId: targetId, tagId, loggingMetadata },
            }),
            {
              successToast: 'Tag deleted successfully from course',
              showErrorToast: true,
            },
          )
        } else {
          await handleAction(
            toggleNoteTag({
              data: {
                noteId: targetId,
                tagId,
                action: 'remove',
                loggingMetadata,
              },
            }),
            { successToast: 'removed tag from note', showErrorToast: true },
          )
        }
        router.invalidate()
      } catch (error) {
      } finally {
        setDeletingTagId(null)
      }
    })
  }

  return {
    availableTags,
    isAdding,
    setIsAdding,
    tagQuery,
    setTagQuery,
    isPending,
    deletingTagId,
    handleLink: !readOnly ? handleLink : undefined,
    handleCreateAndLink: !readOnly ? handleCreateAndLink : undefined,
    handleDeleteTagAssociation: !readOnly
      ? handleDeleteTagAssociation
      : undefined,
  }
}
