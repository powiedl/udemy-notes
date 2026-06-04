import { prisma } from '#/lib/db.lib.server'
import { userSettingsSchema } from '#/schemas/settings.schema'
import type {
  UserSettings,
  UpdateUserSettingsInput,
} from '#/schemas/settings.schema'
import {
  DEFAULT_EXPORT_SETTINGS,
  DEFAULT_UI_SETTINGS,
} from '#/lib/constants.lib'
import { ServerActionError } from '#/types/errors.type'

/**
 * Führt die Benutzereinstellungen aus der Datenbank mit den Standardwerten der Anwendung zusammen.
 *
 * Da Einstellungen in der Datenbank als JSON gespeichert werden, stellt diese Funktion sicher,
 * dass neue Felder (die nach der Registrierung eines Nutzers hinzugefügt wurden) immer mit
 * sinnvollen Defaults belegt sind. Die Funktion führt einen flachen Merge für Export-Einstellungen
 * und einen tieferen Merge für UI-Einstellungen (speziell für das Sidebar-Objekt) durch.
 *
 * @param dbSettings - Das rohe JSON-Objekt der Einstellungen aus der Datenbank.
 * @returns Ein vollständiges Einstellungs-Objekt, das garantiert alle erforderlichen Pfade enthält.
 * @internal
 */
function mergeWithDefaults(dbSettings: Record<string, any> = {}) {
  return {
    export: { ...DEFAULT_EXPORT_SETTINGS, ...(dbSettings.export || {}) },
    ui: {
      ...DEFAULT_UI_SETTINGS,
      ...(dbSettings.ui || {}),
      sidebar: {
        ...DEFAULT_UI_SETTINGS.sidebar,
        ...(dbSettings.ui?.sidebar || {}),
      },
    },
  }
}

export async function getUserSettingsLogic(
  userId: string,
): Promise<UserSettings> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { settings: true },
  })

  if (!user) throw new ServerActionError('User not found')

  const mergedSettings = mergeWithDefaults(user.settings as Record<string, any>)
  const parsedSettings = userSettingsSchema.safeParse(mergedSettings)

  if (!parsedSettings.success) {
    return { export: DEFAULT_EXPORT_SETTINGS, ui: DEFAULT_UI_SETTINGS }
  }

  return parsedSettings.data
}

export async function updateUserSettingsLogic(
  data: UpdateUserSettingsInput,
  userId: string,
): Promise<UserSettings> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { settings: true },
  })

  if (!user) throw new ServerActionError('User not found')

  const currentSettings = mergeWithDefaults(
    user.settings as Record<string, any>,
  )

  const newMergedSettings = {
    export: {
      ...currentSettings.export,
      ...(data.export || {}),
    },
    ui: {
      ...currentSettings.ui,
      ...(data.ui || {}),
      sidebar: {
        ...currentSettings.ui.sidebar,
        ...(data.ui?.sidebar || {}),
      },
    },
  }

  const parsedSettings = userSettingsSchema.parse(newMergedSettings)

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { settings: parsedSettings as any },
    select: { settings: true },
  })

  return userSettingsSchema.parse(
    mergeWithDefaults(updatedUser.settings as Record<string, any>),
  )
}
