import { exportMdFileSchema } from '#/schemas/export-file'
import { authFn } from '#/lib/rpc'
import { withLogging } from '#/schemas/api-utils'
import { checkImportFileSchema, importFileSchema } from '#/schemas/import-file'
import {
  exportMdFileLogic,
  importHtmlFileLogic,
  importMdFileLogic,
} from './import-export.logic.server'

// #region validation schemas
export const importFileValidationSchema = importFileSchema
export const exportMdFileValidationSchema = withLogging(exportMdFileSchema)
export const checkImportFileValidationSchema = withLogging(
  checkImportFileSchema,
)
// #endregion

export type AwaitedReturnTypeExportMdFile = Awaited<
  ReturnType<typeof exportMdFile>
>
export type AwaitedReturnTypeImportHtmlFile = Awaited<
  ReturnType<typeof importHtmlFile>
>

export const checkImportFile = authFn
  .inputValidator(checkImportFileValidationSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    const { checkImportFileLogic } =
      await import('./import-export.logic.server')

    return await wrapServerAction(
      'checkImportFile',
      context,
      data,
      async () => {
        return checkImportFileLogic(data.fileContent)
      },
    )
  })
/**
 * Authentifizierte Server Function (RPC) für den Import einer Udemy-HTML-Datei.
 * Übernimmt die Validierung der Eingaben, stellt den Benutzerkontext bereit und
 * delegiert die Verarbeitung an `importHtmlFileLogic`.
 */
export const importHtmlFile = authFn
  .inputValidator(importFileValidationSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    return await wrapServerAction('importHtmlFile', context, data, async () => {
      const result = importHtmlFileLogic(data, context.session.user.id)
      return result
    })
  })

export const importMdFile = authFn
  .inputValidator(importFileValidationSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    return await wrapServerAction('importMdFile', context, data, async () => {
      return importMdFileLogic(data, context.session.user.id)
    })
  })

/**
 * Authentifizierte Server Function (RPC) für den Kurs-Export.
 * Dient als Entry-Point für das Frontend, validiert die Export-Optionen und
 * nutzt `exportMdFileLogic` zur Generierung des Inhalts.
 */
export const exportMdFile = authFn
  .inputValidator(exportMdFileValidationSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    return await wrapServerAction('exportMdFile', context, data, async () => {
      return exportMdFileLogic(data, context.session.user.id)
    })
  })
