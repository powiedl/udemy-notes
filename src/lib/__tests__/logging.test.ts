import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logToDb } from '#/lib/logging.server'
import { prisma } from '#/lib/db.server'

// WICHTIG: Der Pfad muss EXAKT dem Import oben entsprechen!
vi.mock('#/lib/db.server', () => ({
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
    // Mock-Rückgabewert definieren
    const mockCreatedLog = { id: 'uuid-123', message: 'Test-Log' }
    vi.mocked(prisma.log.create).mockResolvedValue(mockCreatedLog as any)

    const params = {
      metadata: { component: 'TestComponent', feature: 'Unit-Test' },
      serverFunction: 'testFn',
      severity: 'error' as const,
      message: 'Kritischer Fehler aufgetreten',
      userId: 'user_1',
      requestId: 'req_123', // Testen wir gleich unsere neuen Tracing-IDs mit
      correlationId: 'corr_456',
    }

    // Funktion ausführen
    const result = await logToDb(params)

    // Überprüfen, ob Prisma korrekt "gefüttert" wurde
    expect(prisma.log.create).toHaveBeenCalledWith({
      data: {
        component: 'TestComponent',
        serverFunction: 'testFn',
        severity: 'error',
        message: 'Kritischer Fehler aufgetreten',
        userId: 'user_1',
        requestId: 'req_123',
        correlationId: 'corr_456',
      },
    })

    // Überprüfen, ob das Ergebnis dem DB-Resultat entspricht
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
        // Prisma sollte hier undefined für die optionalen IDs empfangen
        requestId: undefined,
        correlationId: undefined,
      },
    })
  })
})
