/* @vitest-environment jsdom */
import { describe, it, expect } from 'vitest'

process.env.TANSTACK_START_IMPORT_PROTECTION = 'off'

/* eslint-disable import/first */
import { mapNoteDisplayTags } from '#/data/note.logic.server'
import { DEFAULT_TAG_COLOR } from '#/schemas/tag.schema'
/* eslint-enable import/first */

describe('mapNoteDisplayTags', () => {
  it('sollte direkte öffentliche Tags korrekt markieren', () => {
    const input = {
      id: 'note-1',
      tags: [{ tag: { id: 't1', name: 'React' } }],
      course: { tags: [] },
    }

    const result = mapNoteDisplayTags(input as any)

    expect(result.displayTags).toHaveLength(1)
    expect(result.displayTags[0]).toEqual(
      expect.objectContaining({
        // userId und color sind bei öffentlichen Tags null
        tag: expect.objectContaining({
          id: 't1',
          name: 'React',
          color: null,
          userId: null,
        }),
        isDirect: true,
        isFromCourse: false,
        status: 'APPROVED',
      }),
    )
  })

  it('sollte rein geerbte Tags vom Kurs korrekt markieren', () => {
    const input = {
      id: 'note-2',
      tags: [],
      course: { tags: [{ tag: { id: 't2', name: 'Frontend' } }] },
    }

    const result = mapNoteDisplayTags(input as any)

    expect(result.displayTags).toHaveLength(1)
    expect(result.displayTags[0]).toEqual(
      expect.objectContaining({
        tag: expect.objectContaining({
          id: 't2',
          name: 'Frontend',
          color: null,
          userId: null,
        }),
        isDirect: false,
        isFromCourse: true,
        status: 'APPROVED',
      }),
    )
  })

  it('sollte redundante Tags (direkt + Kurs) korrekt markieren', () => {
    const input = {
      id: 'note-3',
      tags: [{ tag: { id: 't3', name: 'TypeScript' } }],
      course: { tags: [{ tag: { id: 't3', name: 'TypeScript' } }] },
    }

    const result = mapNoteDisplayTags(input as any)

    expect(result.displayTags).toHaveLength(1)
    expect(result.displayTags[0]).toEqual(
      expect.objectContaining({
        tag: expect.objectContaining({
          id: 't3',
          name: 'TypeScript',
          color: null,
          userId: null,
        }),
        isDirect: true,
        isFromCourse: true,
        status: 'APPROVED',
      }),
    )
  })

  // --- NEUE TESTS FÜR PRIVATE TAGS UND FARBEN ---

  it('sollte bei privaten Tags eine übergebene Farbe strikt beibehalten', () => {
    const input = {
      id: 'note-4',
      tags: [
        {
          tag: {
            id: 't4',
            name: 'PrivatesTag',
            userId: 'user-123',
            color: 'red',
          },
        },
      ],
      course: { tags: [] },
    }

    const result = mapNoteDisplayTags(input as any)

    expect(result.displayTags).toHaveLength(1)
    expect(result.displayTags[0]).toEqual(
      expect.objectContaining({
        // Farbe "red" bleibt erhalten
        tag: expect.objectContaining({
          id: 't4',
          name: 'PrivatesTag',
          userId: 'user-123',
          color: 'red',
        }),
        isDirect: true,
        isFromCourse: false,
        status: 'APPROVED',
      }),
    )
  })

  it('sollte bei privaten Tags ohne Farbangabe auf den DEFAULT_TAG_COLOR zurückfallen', () => {
    const input = {
      id: 'note-5',
      tags: [
        {
          tag: {
            id: 't5',
            name: 'AltesPrivatesTag',
            userId: 'user-123',
            color: null,
          },
        },
      ],
      course: { tags: [] },
    }

    const result = mapNoteDisplayTags(input as any)

    expect(result.displayTags).toHaveLength(1)
    expect(result.displayTags[0]).toEqual(
      expect.objectContaining({
        // Farbe ist null im Input, wird also durch die Waschanlage zu DEFAULT_TAG_COLOR (meist 'blue')
        tag: expect.objectContaining({
          id: 't5',
          name: 'AltesPrivatesTag',
          userId: 'user-123',
          color: DEFAULT_TAG_COLOR,
        }),
        isDirect: true,
        isFromCourse: false,
        status: 'APPROVED',
      }),
    )
  })

  it('sollte gemischte Arrays (öffentlich und privat) korrekt verarbeiten', () => {
    const input = {
      id: 'note-6',
      tags: [
        { tag: { id: 't-pub', name: 'Public' } }, // ohne userId
        {
          tag: {
            id: 't-priv',
            name: 'Private',
            userId: 'user-123',
            color: 'cyan',
          },
        }, // mit userId
      ],
      course: { tags: [] },
    }

    const result = mapNoteDisplayTags(input as any)

    expect(result.displayTags).toHaveLength(2)

    // Wir sortieren das Array im Test alphabetisch nach Name, da mapNoteDisplayTags auch nach Name sortiert!
    // 'Private' kommt vor 'Public'
    expect(result.displayTags[0].tag).toEqual(
      expect.objectContaining({
        name: 'Private',
        userId: 'user-123',
        color: 'cyan',
      }),
    )
    expect(result.displayTags[1].tag).toEqual(
      expect.objectContaining({ name: 'Public', userId: null, color: null }),
    )
  })
})
