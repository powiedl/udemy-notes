import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handleGlobalError } from '#/lib/error-handler.lib.server'
import { ServerActionError } from '#/types/errors'
import { SERVER_ERROR_SANITIZED_MESSAGE } from '#/lib/constants.lib.server'
import { logToDb } from '#/lib/logging.lib.server'

// MOCK KORRIGIERT: Pfad muss exakt mit dem Import übereinstimmen!
vi.mock('#/lib/logging.server', () => ({
  logToDb: vi.fn(async () => {}).mockResolvedValue(undefined),
}))

// import { logToDb } from '#/lib/logging.server' // wäre notwendig, wenn man irgendwo mit dynamischen import arbeiten würde: const { logToDb } = await import('#/lib/logging.server')

describe('Global Error Handling Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    // Stellt das normale console.error nach den Tests wieder her!
    vi.restoreAllMocks()
  })
  it('sollte einen ServerActionError loggen (warning) und unmaskiert durchwinken', async () => {
    const safeError = new ServerActionError('Das ist ein sicherer Fehler')

    // Expect original error
    await expect(handleGlobalError(safeError)).rejects.toThrowError(
      'Das ist ein sicherer Fehler',
    )

    expect(logToDb).toHaveBeenCalledTimes(1)
    expect(logToDb).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'warning',
        message: 'Das ist ein sicherer Fehler',
      }),
    )
  })

  it('sollte einen Zod-Validierungsfehler loggen (warning) und unmaskiert durchwinken', async () => {
    const zodError = new Error('Zod Validation Failed')
    zodError.name = 'ZodError'

    // Expect original error (WICHTIG für Formular-Feedback im UI!)
    await expect(handleGlobalError(zodError)).rejects.toThrowError(
      'Zod Validation Failed',
    )

    expect(logToDb).toHaveBeenCalledTimes(1)
    expect(logToDb).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'warning',
        serverFunction: 'Validator',
      }),
    )
  })

  it('sollte einen kritischen Fehler loggen (critical) UND maskieren', async () => {
    const criticalError = new Error('Geheimer Datenbank-Crash 123')

    // Expect sanitized error
    await expect(handleGlobalError(criticalError)).rejects.toThrowError(
      SERVER_ERROR_SANITIZED_MESSAGE,
    )

    expect(logToDb).toHaveBeenCalledTimes(1)
    expect(logToDb).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'critical',
        message: 'Geheimer Datenbank-Crash 123',
        serverFunction: 'Unknown/Outside Action',
      }),
    )
  })
})
