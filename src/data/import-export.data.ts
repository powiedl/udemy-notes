import { exportMdFileSchema } from '#/schemas/export-file.schema'
import { authFn } from '#/lib/rpc.lib'
import { withLogging } from '#/schemas/api-utils.schema'
import {
  analyzeHtmlPayloadSchema,
  checkImportFileSchema,
  importFileSchema,
  saveParsedCourseSchema,
} from '#/schemas/import-file.schema'

// #region validation schemas
export const importFileValidationSchema = importFileSchema
export const exportMdFileValidationSchema = withLogging(exportMdFileSchema)
export const checkImportFileValidationSchema = withLogging(
  checkImportFileSchema,
)
// #endregion

export type AwaitedReturnTypeExportMdFile = Awaited<
  ReturnType<typeof exportMdFileFn>
>
export type AwaitedReturnTypeImportHtmlFile = Awaited<
  ReturnType<typeof importHtmlFile>
>

export const checkImportFile = authFn
  .inputValidator(checkImportFileValidationSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.lib.server')
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
  .inputValidator(saveParsedCourseSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.lib.server')
    const { importHtmlFileLogic } =
      await import('#/data/import-export.logic.server')
    return await wrapServerAction('importHtmlFile', context, data, async () => {
      const result = await importHtmlFileLogic(data, context.session.user.id)
      return result
    })
  })

export const analyzeHtmlPayloadFn = authFn
  .inputValidator(analyzeHtmlPayloadSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.lib.server')
    const { analyzeHtmlPayloadLogic } =
      await import('./import-export.logic.server')

    // Wir übergeben ein leeres loggingMetadata Objekt, falls wir später Metadaten ergänzen wollen,
    // ansonsten fängt das Sicherheitsnetz im wrapServerAction dies sauber ab.
    return await wrapServerAction(
      'analyzeHtmlPayloadFn',
      context,
      { loggingMetadata: { component: 'AnalyzeHtml' } },
      async () => {
        const result = await analyzeHtmlPayloadLogic(
          data,
          context.session.user.id,
        )
        return result
      },
    )
  })

export const importMdFileFn = authFn
  .inputValidator(importFileValidationSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.lib.server')
    const { importMdFileLogic } =
      await import('#/data/import-export.logic.server')
    return await wrapServerAction('importMdFile', context, data, async () => {
      return importMdFileLogic(data, context.session.user.id)
    })
  })

/**
 * Authentifizierte Server Function (RPC) für den Kurs-Export.
 * Dient als Entry-Point für das Frontend, validiert die Export-Optionen und
 * nutzt `exportMdFileLogic` zur Generierung des Inhalts.
 */
export const exportMdFileFn = authFn
  .inputValidator(exportMdFileValidationSchema)
  .handler(async ({ data, context }) => {
    const { wrapServerAction } = await import('#/lib/server-utils.lib.server')
    const { exportMdFileLogic } =
      await import('#/data/import-export.logic.server')
    return await wrapServerAction('exportMdFile', context, data, async () => {
      return exportMdFileLogic(data, context.session.user.id)
    })
  })
