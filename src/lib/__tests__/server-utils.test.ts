import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logToDb } from '#/lib/logging'
import { ServerActionError, wrapServerAction } from '#/lib/server-utils'

// Wir mocken die Logging-Funktion, damit kein DB-Zugriff erfolgt
vi.mock('#/lib/logging', () => ({
  logToDb: vi.fn().mockResolvedValue(undefined), // Mockt, dass logToDb ein Promise zurückgibt
}))

describe('wrapServerAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sollte bei erfolgreicher Ausführung success: true und Daten zurückgeben', async () => {
    const mockData = { id: '123', title: 'Test Kurs' }
    const mockFn = async () => mockData
    const options = { metadata: { component: 'TestComponent' } }
    const context = { session: null }
    const input = { loggingMetadata: options.metadata }

    const result = await wrapServerAction(
      'testFunction',
      context,
      input,
      mockFn,
    )

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(mockData)
    }
    expect(logToDb).not.toHaveBeenCalled()
  })
  it('sollte einen ServerActionError abfangen, loggen und die clientMessage zurückgeben', async () => {
    const CLIENT_MSG = 'Benutzerfreundlicher Fehler'
    const mockFn = async () => {
      throw new ServerActionError(CLIENT_MSG)
    }
    const context = { session: null }
    const input = { loggingMetadata: { component: 'SpecificComponent' } }

    const result = await wrapServerAction(
      'testFunction',
      context,
      input,
      mockFn,
    )

    // Prüfung der Antwort an den Client
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe(CLIENT_MSG)
    }

    // Prüfung, ob korrekt mit den übergebenen Metadaten geloggt wurde
    expect(logToDb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: CLIENT_MSG,
        metadata: expect.objectContaining({ component: 'SpecificComponent' }),
        serverFunction: 'testFunction',
        severity: 'error',
      }),
    )
  })

  it('sollte unerwartete Fehler maskieren (Sicherheit!) und trotzdem loggen', async () => {
    const TECHNICAL_ERROR = 'Prisma Connection Timeout'
    const mockFn = async () => {
      throw new Error(TECHNICAL_ERROR)
    }
    const context = { session: null }
    const input = { loggingMetadata: { component: 'TestComponent' } }

    const result = await wrapServerAction(
      'testFunction',
      context,
      input,
      mockFn,
    )

    expect(result.success).toBe(false)
    if (!result.success) {
      // Wichtig: Der User darf den technischen Fehler nicht sehen
      expect(result.error).toBe('An unexpected server error occured')
    }

    // Aber im Log muss die Wahrheit stehen
    expect(logToDb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: TECHNICAL_ERROR,
        metadata: expect.objectContaining({ component: 'TestComponent' }),
        serverFunction: 'testFunction',
        severity: 'error',
      }),
    )
  })

  it('sollte die userId mitloggen, wenn ProtectedLogOptions verwendet werden', async () => {
    const mockFn = async () => {
      throw new Error('Fail')
    }
    const context = { session: { user: { id: 'user_99' } } }
    const input = { loggingMetadata: { component: 'SecureZone' } }

    await wrapServerAction('protectedFn', context, input, mockFn)

    expect(logToDb).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_99',
      }),
    )
  })
})
