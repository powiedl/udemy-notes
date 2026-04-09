import { describe, it, expect, vi, beforeEach } from 'vitest'
import { wrapServerAction } from '#/lib/server-utils'
import { logToDb } from '#/lib/logging'

// Wir mocken die Logging-Funktion, damit kein DB-Zugriff erfolgt
vi.mock('#/lib/logging', () => ({
  logToDb: vi.fn(),
}))

describe('wrapServerAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sollte bei erfolgreicher Ausführung success: true und Daten zurückgeben', async () => {
    const mockData = { id: '123', title: 'Test Kurs' }
    const mockFn = async () => mockData
    const options = { metadata: { component: 'TestComponent' } }

    const result = await wrapServerAction('testFunction', mockFn, options)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(mockData)
    }
    expect(logToDb).not.toHaveBeenCalled()
  })

  // Dieser Test kann erst funktionieren, wenn wir unsere neue Klasse ActionError verwenden (die einen Userfriendly Error zurückliefern kann)
  // it('sollte einen ActionError abfangen, loggen und die clientMessage zurückgeben', async () => {
  //   const CLIENT_MSG = 'Benutzerfreundlicher Fehler'
  //   const mockFn = async () => {
  //     throw new ActionError(CLIENT_MSG, {
  //       metadata: {
  //         component: 'SpecificComponent',
  //         functionName: 'testFunction',
  //       },
  //     })
  //   }

  //   const result = await wrapServerAction('testFunction', mockFn, {
  //     metadata: { component: 'FallbackComponent' },
  //   })

  //   // Prüfung der Antwort an den Client
  //   expect(result.success).toBe(false)
  //   if (!result.success) {
  //     expect(result.error).toBe(CLIENT_MSG)
  //   }

  //   // Prüfung, ob korrekt mit den Error-eigenen Metadaten geloggt wurde
  //   expect(logToDb).toHaveBeenCalledWith(
  //     expect.objectContaining({
  //       message: CLIENT_MSG,
  //       metadata: expect.objectContaining({ component: 'SpecificComponent' }),
  //     }),
  //   )
  // })

  // Dieser Test kann erst funktionieren, wenn wir am Server nur mehr die für den Client relevanten/richtigen Informationen zurückliefern
  // it('sollte unerwartete Fehler maskieren (Sicherheit!) und trotzdem loggen', async () => {
  //   const TECHNICAL_ERROR = 'Prisma Connection Timeout'
  //   const mockFn = async () => {
  //     throw new Error(TECHNICAL_ERROR)
  //   }

  //   const result = await wrapServerAction('testFunction', mockFn, {
  //     metadata: { component: 'TestComponent' },
  //   })

  //   expect(result.success).toBe(false)
  //   if (!result.success) {
  //     // Wichtig: Der User darf den technischen Fehler nicht sehen
  //     expect(result.error).toBe('Ein unerwarteter Fehler ist aufgetreten.')
  //   }

  //   // Aber im Log muss die Wahrheit stehen
  //   expect(logToDb).toHaveBeenCalledWith(
  //     expect.objectContaining({
  //       message: TECHNICAL_ERROR,
  //     }),
  //   )
  // })

  it('sollte die userId mitloggen, wenn ProtectedLogOptions verwendet werden', async () => {
    const mockFn = async () => {
      throw new Error('Fail')
    }
    const protectedOptions = {
      metadata: { component: 'SecureZone' },
      session: { userId: 'user_99' },
    }

    await wrapServerAction('protectedFn', mockFn, protectedOptions)

    expect(logToDb).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_99',
      }),
    )
  })
})
