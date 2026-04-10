Verstanden, Chef! `.inputValidator` it is – ich habe die Lektion gelernt. Hier ist die exakte, finale Dokumentation für dich zum direkten Kopieren:

# Server Function System

**Version:** 26.410.1

Dieses Dokument beschreibt das aktuelle Server Function System im Projekt. Es ist darauf ausgelegt, dass alle Server-Funktionen:

- maximale TypeScript-Inferenz für den Client garantieren (keine anonymen Funktionen in Validatoren),
- einen einheitlichen Rückgabetyp verwenden (`UdNoServerResponse`),
- Fehler automatisch in die Datenbank loggen,
- UI-freundliche Fehler via `ServerActionError` zum Client transportieren,
- Metadaten aus der aufrufenden Komponente unterstützen.

---

## Das Datenmodell (Prisma)

**Datei:** `prisma/schema.prisma`

Das Log-Modell speichert Fehler zentral in der PostgreSQL/Neon Datenbank. Wir trennen `serverFunction` (Name der Logik) und `component` (Ort im UI), um beim Debuggen schnell zu sehen, welcher Flow betroffen war.

```prisma
model Log {
  id             String  @id @default(uuid())
  component      String? // Frontend-Komponente (optional beim Aufruf)
  serverFunction String? // Name der Server Function (automatisch)
  severity       String? // info, warning, error, critical
  message        String? // Fehlermeldung oder Info-Text

  userId String? @map("user_id")
  user   User?   @relation(fields: [userId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("log")
}
```

## Der einheitliche Rückgabetyp & Client Logging

**Datei:** `src/types/api.ts`

```typescript
export type UdNoServerResponse<T> =
  | { success: true; data: T; message?: string }
  | {
      success: false
      error: string
      code?: string
      component?: string
      serverFunction?: string
    }

export type ExtractData<T> = T extends { success: true; data: infer D }
  ? D
  : never

export type ServerFnData<T extends (...args: any) => Promise<any>> =
  ExtractData<Awaited<ReturnType<T>>>

export interface ClientLoggingMetadata {
  component?: string
  feature?: string
}
```

## Logging-Metadaten und Validator

**Datei:** `src/schemas/api-utils.ts`

```typescript
import { z } from 'zod'

export const clientLoggingMetadataSchema = z.object({
  component: z.string().optional(),
  feature: z.string().optional(),
})

export const loggingMetadataSchema = z.object({
  loggingMetadata: clientLoggingMetadataSchema.optional(),
})

export function withLogging<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema.merge(loggingMetadataSchema)
}

// Beispiel für standardisierte IDs:
export const idSchema = z.object({ id: z.string().min(1) })
export const courseIdSchema = withLogging(idSchema)
```

**Wichtig:** Das Zod-Schema wird nun _direkt_ an den Validator übergeben, um die Typen-Inferenz am Client nicht zu zerstören.

## Server Action Wrapper & Error Handling

**Datei:** `src/lib/server-utils.ts`

Der Wrapper kapselt die Ausführung der Business-Logik. Für Fehler, die direkt als Toast im Frontend angezeigt werden sollen, nutzen wir den `ServerActionError`. Alle anderen Fehler (wie 500er) werden geloggt und generisch verpackt.

```typescript
export class ServerActionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ServerActionError'
  }
}

export async function wrapServerAction<T>(
  serverFunctionName: string,
  context: any, // Enthält session etc.
  data: any, // Enthält loggingMetadata
  fn: () => Promise<T>,
  successMessage?: string,
): Promise<UdNoServerResponse<T>> {
  // ... interne Logik:
  // 1. Führt fn() aus
  // 2. Fängt ServerActionError -> success: false, error: message
  // 3. Fängt andere Errors -> logToDb() -> success: false, error: "Something went wrong"
  // 4. Bei Erfolg -> success: true, data: result
}
```

## Server Functions im aktuellen Code

### Beispiel: Einfache Datenübergabe (`getCourseById`)

**Datei:** `src/data/course.ts`

**Regel:** Keine anonymen Pfeilfunktionen im `.inputValidator()` verwenden!

```typescript
import { createServerFn } from '@tanstack/react-start'
import { authFnMiddleware } from '#/middlewares/auth'
import { wrapServerAction, ServerActionError } from '#/lib/server-utils'
import { courseIdSchema } from '#/schemas/api-utils'
import { prisma } from '#/db'

export const getCourseById = createServerFn({ method: 'GET' })
  .middleware([authFnMiddleware])
  .inputValidator(courseIdSchema) // DIREKTE Übergabe für 100% Typ-Sicherheit
  .handler(async ({ context, data }) => {
    return await wrapServerAction('getCourseById', context, data, async () => {
      const userId = context.session.user.id
      const { id } = data

      const course = await prisma.course.findUnique({
        where: { id, userId },
      })

      // Client-freundlicher Fehler statt notFound() Redirect
      if (!course)
        throw new ServerActionError('Kurs konnte nicht gefunden werden.')

      return course
    })
  })
```

### Beispiel: Datei-Upload mit `FormData` (`importHtmlFile`)

**Datei:** `src/data/import-export.ts`

Bei Dateiuploads ist das Zod-Schema nur der Türsteher (`z.instanceof(FormData)`). Die inhaltliche Validierung (MIME-Type, Dateigröße) passiert im Wrapper.

```typescript
import { z } from 'zod'
import { EMPTY_CLIENT_LOGGING_METADATA } from '#/lib/constants'

const importHtmlSchema = z.instanceof(FormData)

export const importHtmlFile = createServerFn({ method: 'POST' })
  .middleware([authFnMiddleware])
  .inputValidator(importHtmlSchema)
  .handler(async ({ data, context }) => {
    // 1. LoggingMetadata VOR dem Wrapper extrahieren
    let loggingMetadata = EMPTY_CLIENT_LOGGING_METADATA
    const rawLogging = data.get('loggingMetadata')
    if (typeof rawLogging === 'string') {
      try {
        loggingMetadata = JSON.parse(rawLogging)
      } catch (e) {}
    }

    // 2. Wrapper aufrufen
    return await wrapServerAction(
      'importHtmlFile',
      context,
      { loggingMetadata },
      async () => {
        // 3. Inhaltliche Validierung HIER durchführen
        const file = data.get('file') as File | null
        if (!file || file.type !== 'text/html') {
          throw new ServerActionError('Es sind nur HTML Dateien erlaubt.')
        }
        if (file.size > MAX_FILE_SIZE_UPLOAD) {
          throw new ServerActionError('Die Datei ist zu groß.')
        }

        // ... Import- und Prisma-Logik ...
        return { success: true }
      },
    )
  })
```

## Client-Side Integration (Frontend)

**Datei:** `src/lib/client-utils.ts` (und UI-Komponenten)

Um die einheitliche Struktur am Client sauber auszuwerten und automatische Toasts anzuzeigen, werden Server-Mutations-Aufrufe mit dem `handleAction` Utility umschlossen.

**Beispiel in einer Komponente (`Tag.tsx`):**

```tsx
import { handleAction } from '#/lib/client-utils'
import { useServerFn } from '@tanstack/react-start'
import { useTransition } from 'react'

export const Tag = ({ tag }) => {
  const deleteTag = useServerFn(deleteTagFn)
  const [isPending, startTransition] = useTransition()

  const handleDelete = () => {
    startTransition(async () => {
      try {
        await handleAction(
          deleteTag({
            data: {
              id: tag.id,
              loggingMetadata: { component: 'Tag', feature: 'Delete' },
            },
          }),
          { successToast: 'Tag erfolgreich gelöscht' },
        )
      } catch (error) {
        // Leer lassen: handleAction fängt den Fehler und wirft automatisch den Toast
      }
    })
  }

  return (
    <Button onClick={handleDelete} disabled={isPending}>
      Delete
    </Button>
  )
}
```
