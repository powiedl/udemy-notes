import { describe, it, expect, vi, beforeEach } from 'vitest'
// WICHTIG: Importe und Mocks müssen exakt zusammenpassen
import { logToDb } from '#/lib/logging.lib.server'
import { wrapServerAction } from '#/lib/server-utils.lib.server'
import { ServerActionError } from '#/types/errors'
import { SERVER_ERROR_SANITIZED_MESSAGE } from '#/lib/constants.lib.server'

// Wir mocken den exakten Pfad, den auch der Server-Util nutzt
vi.mock('#/lib/logging.server', () => ({
  logToDb: vi.fn().mockResolvedValue(undefined),
}))

describe('wrapServerAction', () => {
  const mockRequestId = 'req_123'
  const mockCorrelationId = 'corr_456'

  // Ein Standard-Context, wie ihn unsere Middleware erzeugt
  const mockContext = {
    requestId: mockRequestId,
    correlationId: mockCorrelationId,
    session: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sollte bei Erfolg success: true, Daten und Tracing-IDs zurückgeben', async () => {
    const mockData = { id: '123' }
    const mockFn = async () => mockData
    const input = { loggingMetadata: { component: 'TestUI' } }

    const result = await wrapServerAction(
      'testFunction',
      mockContext,
      input,
      mockFn,
    )

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(mockData)
      expect(result.requestId).toBe(mockRequestId)
    }
    expect(logToDb).not.toHaveBeenCalled()
  })

  it('sollte einen ServerActionError abfangen, loggen und die IDs mitschicken', async () => {
    const CLIENT_MSG = 'Sicherer Fehler'
    const mockFn = async () => {
      throw new ServerActionError(CLIENT_MSG)
    }
    const input = { loggingMetadata: { component: 'SpecificComponent' } }

    const result = await wrapServerAction(
      'testFunction',
      mockContext,
      input,
      mockFn,
    )

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe(CLIENT_MSG)
      expect(result.requestId).toBe(mockRequestId)
    }

    expect(logToDb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: CLIENT_MSG,
        requestId: mockRequestId,
        correlationId: mockCorrelationId,
        serverFunction: 'testFunction',
      }),
    )
  })

  it('sollte unerwartete Fehler maskieren, aber die volle Wahrheit loggen', async () => {
    const TECHNICAL_ERROR = 'Database Exploded'
    const mockFn = async () => {
      throw new Error(TECHNICAL_ERROR)
    }
    const input = { loggingMetadata: { component: 'TestComponent' } }

    const result = await wrapServerAction(
      'testFunction',
      mockContext,
      input,
      mockFn,
    )

    expect(result.success).toBe(false)
    if (!result.success) {
      // Client kriegt nur die generische Meldung
      expect(result.error).toBe(SERVER_ERROR_SANITIZED_MESSAGE)
      expect(result.requestId).toBe(mockRequestId)
    }

    // Log kriegt den echten Fehlertext
    expect(logToDb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: TECHNICAL_ERROR,
        requestId: mockRequestId,
      }),
    )
  })

  it('sollte die userId mitloggen, wenn eine Session im Context ist', async () => {
    const mockFn = async () => {
      throw new Error('Fail')
    }
    const secureContext = {
      ...mockContext,
      session: { user: { id: 'user_99' } },
    }
    const input = { loggingMetadata: { component: 'SecureZone' } }

    await wrapServerAction('protectedFn', secureContext, input, mockFn)

    expect(logToDb).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_99',
      }),
    )
  })
})
