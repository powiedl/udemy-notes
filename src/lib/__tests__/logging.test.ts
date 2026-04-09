import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logToDb } from '../logging'
import { prisma } from '#/db'

// 1. Das Datenbank-Modul mocken
vi.mock('#/db', () => ({
  prisma: {
    log: {
      create: vi.fn(),
    },
  },
}))

describe('logToDb', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sollte prisma.log.create mit den korrekten Parametern aufrufen', async () => {
    // Mock-Rückgabewert definieren (simuliert einen erfolgreichen DB-Eintrag)
    const mockCreatedLog = { id: 'uuid-123', message: 'Test-Log' }
    vi.mocked(prisma.log.create).mockResolvedValue(mockCreatedLog as any)

    const params = {
      metadata: { component: 'TestComponent', feature: 'Unit-Test' },
      serverFunction: 'testFn',
      severity: 'error' as const,
      message: 'Kritischer Fehler aufgetreten',
      userId: 'user_1',
    }

    // 2. Funktion ausführen
    const result = await logToDb(params)

    // 3. Überprüfen, ob Prisma korrekt "gefüttert" wurde
    expect(prisma.log.create).toHaveBeenCalledWith({
      data: {
        component: 'TestComponent',
        serverFunction: 'testFn',
        severity: 'error',
        message: 'Kritischer Fehler aufgetreten',
        userId: 'user_1',
      },
    })

    // Überprüfen, ob das Ergebnis der Funktion dem DB-Resultat entspricht
    expect(result).toEqual(mockCreatedLog)
  })

  it('sollte auch funktionieren, wenn optionale Felder fehlen', async () => {
    vi.mocked(prisma.log.create).mockResolvedValue({ id: 'uuid-456' } as any)

    await logToDb({
      metadata: { component: 'Minimal' },
      severity: 'info',
      message: 'Minimaler Log',
    })

    expect(prisma.log.create).toHaveBeenCalledWith({
      data: {
        component: 'Minimal',
        serverFunction: undefined,
        severity: 'info',
        message: 'Minimaler Log',
        userId: undefined,
      },
    })
  })
})
