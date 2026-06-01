import { prisma } from '#/lib/db.lib.server'
import { userSettingsSchema } from '#/schemas/settings.schema'
import type { UserSettings } from '#/schemas/settings.schema'
import { DEFAULT_EXPORT_SETTINGS } from '#/lib/constants.lib'
import { ServerActionError } from '#/types/errors.type'

export async function getUserSettingsLogic(
  userId: string,
): Promise<UserSettings> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { settings: true },
  })
  if (!user) throw new ServerActionError('User not found')

  const dbSettings = user.settings as Record<string, any>

  const mergedSettings = {
    export: {
      ...DEFAULT_EXPORT_SETTINGS,
      ...(dbSettings.export || {}),
    },
  }

  const parsedSettings = userSettingsSchema.safeParse(mergedSettings)

  if (!parsedSettings.success) {
    return { export: DEFAULT_EXPORT_SETTINGS }
  }

  return parsedSettings.data
}

export async function updateUserSettingsLogic(
  newSettings: UserSettings,
  userId: string,
) {
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      settings: newSettings as any, // 'any' oder 'Prisma.InputJsonValue' wegen Prisma JSON Typisierung
    },
    select: { settings: true },
  })

  return userSettingsSchema.parse(updatedUser.settings)
}
