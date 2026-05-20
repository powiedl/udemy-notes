import { describe, it, expect } from 'vitest'
import { analyzeHtmlPayloadSchema } from '../import-file'
import { MAX_FILE_SIZE_UPLOAD } from '#/lib/constants.lib'

describe('analyzeHtmlPayloadSchema Validation', () => {
  const validPayload = {
    content: '<html><body>Udemy Notes</body></html>',
    fileName: 'course.html',
    fileSize: MAX_FILE_SIZE_UPLOAD - 2,
    trainers: ['Max Mustermann'],
    tagIds: [],
    newPrivateTags: [],
    parsedTrainerUrl: 'https://udemy.com/user/max-mustermann/',
  }

  it('Akzeptiert einen Payload mit gültiger Dateigröße', () => {
    // --- WHEN ---
    const result = analyzeHtmlPayloadSchema.safeParse(validPayload)

    // --- THEN ---
    expect(result.success).toBe(true)
  })

  it('Wirft einen Validierungsfehler, wenn die Datei zu groß ist', () => {
    // --- GIVEN ---
    const oversizedPayload = {
      ...validPayload,
      fileSize: MAX_FILE_SIZE_UPLOAD + 1,
    }

    // --- WHEN ---
    const result = analyzeHtmlPayloadSchema.safeParse(oversizedPayload)

    // --- THEN ---
    expect(result.success).toBe(false)
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors
      expect(fieldErrors.fileSize).toBeDefined()
      expect(fieldErrors.fileSize?.[0]).toContain(
        'exceeds the maximum allowed limit',
      )
    }
  })
})
