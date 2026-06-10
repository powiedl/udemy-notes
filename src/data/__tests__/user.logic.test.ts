import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getUserSettingsLogic,
  updateUserSettingsLogic,
} from '../user.logic.server'
import { prisma } from '#/lib/db.lib.server'
import {
  DEFAULT_EXPORT_SETTINGS,
  DEFAULT_UI_SETTINGS,
} from '#/lib/constants.lib'
import { ServerActionError } from '#/types/errors.type'

// 1. Prisma Mocken
// Wir ersetzen den echten DB-Client durch Dummy-Funktionen, die wir im Test steuern können.
vi.mock('#/lib/db.lib.server', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

describe('User Settings Logic Server', () => {
  beforeEach(() => {
    // Vor jedem Test setzen wir alle Mocks zurück, damit sich Tests nicht gegenseitig beeinflussen
    vi.clearAllMocks()
  })

  describe('getUserSettingsLogic', () => {
    it('wirft einen ServerActionError, wenn der Benutzer nicht gefunden wird', async () => {
      // Simuliere: Benutzer nicht in der DB
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

      await expect(getUserSettingsLogic('test-user-id')).rejects.toThrow(
        ServerActionError,
      )
      await expect(getUserSettingsLogic('test-user-id')).rejects.toThrow(
        'User not found',
      )
    })

    it('gibt die Standardeinstellungen zurück, wenn der Benutzer noch keine hat (leeres JSON)', async () => {
      // Simuliere: Benutzer existiert, hat aber {} oder null als Settings
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        settings: {},
      } as any)

      const result = await getUserSettingsLogic('test-user-id')

      expect(result).toEqual({
        export: DEFAULT_EXPORT_SETTINGS,
        ui: DEFAULT_UI_SETTINGS,
      })
    })

    it('mergt bestehende DB-Einstellungen korrekt mit den Standardeinstellungen', async () => {
      // Simuliere: Benutzer hat teilweise eigene Settings (z.B. Sidebar zugeklappt)
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        settings: {
          ui: { sidebar: { collapsed: true } },
        },
      } as any)

      const result = await getUserSettingsLogic('test-user-id')

      // Die Sidebar-Einstellung muss übernommen worden sein
      expect(result.ui.sidebar.collapsed).toBe(true)
      // Der Rest muss aus den Defaults kommen
      expect(result.export).toEqual(DEFAULT_EXPORT_SETTINGS)
    })

    it('fällt auf Defaults zurück, wenn die geparsten Settings das Zod-Schema verletzen (korrupte DB-Daten)', async () => {
      // Simuliere: Komplett ungültige Datentypen in der DB (z.B. durch alte Migrationen)
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        settings: {
          export: 'dies-sollte-ein-objekt-sein-und-kein-string',
        },
      } as any)

      const result = await getUserSettingsLogic('test-user-id')

      // safeParse sollte fehlschlagen und wir erwarten den Fallback auf unsere Konstanten
      expect(result).toEqual({
        export: DEFAULT_EXPORT_SETTINGS,
        ui: DEFAULT_UI_SETTINGS,
      })
    })
  })

  describe('updateUserSettingsLogic', () => {
    it('wirft einen ServerActionError beim Update, wenn der Benutzer nicht gefunden wird', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

      await expect(
        updateUserSettingsLogic({ export: {} }, 'test-user-id'),
      ).rejects.toThrow(ServerActionError)
    })

    it('führt einen Deep-Merge der neuen Einstellungen durch und speichert sie in der DB', async () => {
      // 1. Finde Benutzer (Ausgangszustand)
      // Wir nutzen eine ECHTE Eigenschaft deines Schemas (includeCourseDescription),
      // da Zod erfundene Eigenschaften wie "format: pdf" sonst einfach löscht!
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        settings: {
          export: { includeCourseDescription: false },
          ui: { sidebar: { collapsed: false } },
        },
      } as any)

      // 2. Update-Antwort simulieren (was Prisma zurückgeben würde)
      vi.mocked(prisma.user.update).mockResolvedValue({
        settings: {
          export: { includeCourseDescription: false },
          ui: { sidebar: { collapsed: true } }, // Geänderter Wert
        },
      } as any)

      // Wir wollen NUR collapsed ändern
      const updateData = {
        ui: { sidebar: { collapsed: true } },
      }

      await updateUserSettingsLogic(updateData, 'test-user-id')

      // Prüfen, ob Prisma mit den KORREKT gemergten Daten aufgerufen wurde
      expect(prisma.user.update).toHaveBeenCalledTimes(1)

      const updateCallArgs = vi.mocked(prisma.user.update).mock.calls[0][0]

      // Das zu speichernde Objekt muss alte und neue Daten enthalten
      expect(updateCallArgs.where).toEqual({ id: 'test-user-id' })
      expect(updateCallArgs.data.settings).toEqual(
        expect.objectContaining({
          // Testet, ob das alte Export-Feld den Merge überlebt hat:
          export: expect.objectContaining({ includeCourseDescription: false }),
          ui: expect.objectContaining({
            // Testet, ob das Update übernommen wurde:
            sidebar: expect.objectContaining({ collapsed: true }),
          }),
        }),
      )
    })
  })
})
