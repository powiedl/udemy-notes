/* @vitest-environment jsdom */
import { describe, it, expect } from 'vitest'

process.env.TANSTACK_START_IMPORT_PROTECTION = 'off'

/* eslint-disable import/first */
import { mapNoteDisplayTags } from '#/data/note.logic.server'
/* eslint-enable import/first */

describe('mapNoteDisplayTags', () => {
  it('sollte direkte Tags korrekt markieren', () => {
    const input = {
      id: 'note-1',
      tags: [{ tag: { id: 't1', name: 'React' } }],
      course: { tags: [] },
    }

    const result = mapNoteDisplayTags(input)

    expect(result.displayTags).toHaveLength(1)
    expect(result.displayTags[0]).toEqual(
      expect.objectContaining({
        tag: { id: 't1', name: 'React' },
        isDirect: true,
        isFromCourse: false,
      }),
    )
  })

  it('sollte rein geerbte Tags vom Kurs korrekt markieren', () => {
    const input = {
      id: 'note-2',
      tags: [],
      course: { tags: [{ tag: { id: 't2', name: 'Frontend' } }] },
    }

    const result = mapNoteDisplayTags(input)

    expect(result.displayTags).toHaveLength(1)
    expect(result.displayTags[0]).toEqual(
      expect.objectContaining({
        tag: { id: 't2', name: 'Frontend' },
        // Hier greift das aktuelle, kuriose Verhalten:
        isDirect: false,
        isFromCourse: true,
      }),
    )
  })

  it('sollte redundante Tags (direkt + Kurs) korrekt markieren', () => {
    const input = {
      id: 'note-3',
      tags: [{ tag: { id: 't3', name: 'TypeScript' } }],
      course: { tags: [{ tag: { id: 't3', name: 'TypeScript' } }] },
    }

    const result = mapNoteDisplayTags(input)

    expect(result.displayTags).toHaveLength(1)
    // Hier sichern wir das aktuelle Verhalten ab, vor dem du Respekt hast:
    expect(result.displayTags[0]).toEqual(
      expect.objectContaining({
        tag: { id: 't3', name: 'TypeScript' },
        isDirect: true,
        isFromCourse: true,
      }),
    )
  })
})
