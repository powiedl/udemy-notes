# Server Function System

Dieses Dokument beschreibt das aktuelle Server Function System im Projekt. Es ist darauf ausgelegt, dass alle Server-Funktionen:

- einen einheitlichen Rückgabetyp verwenden,
- Fehler automatisch in die Datenbank loggen,
- optional Metadaten aus der aufrufenden Komponente unterstützen,
- und sowohl geschützte als auch öffentliche Server Actions ermöglichen.

Offene Todos:

- Wie kann man Fehler im `inputValidator` ebenfalls in die Datenbank loggen? Ohne das wieder in jedem einzelnen `inputValidator` manuell machen zu müssen?
- `loggingMetaSchema` und `withLogging` haben derzeit noch die component hart codiert. Das sollte ebenfalls auf den Typ `ClientLoggingMetadata` angepasst werden

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

## Der einheitliche Rückgabetyp

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

export const loggingMetadataSchema = z.object({
  loggingMetadata: z
    .object({
      component: z.string().optional(),
    })
    .optional(),
})

export function withLogging<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  const combined = schema.and(loggingMetadataSchema)
  return z.preprocess((val) => val ?? {}, combined)
}
```

`withLogging` sorgt dafür, dass ein fehlendes Input-Objekt als `{}` behandelt wird, damit optionale Felder und Defaults weiterhin funktionieren.

## Server Action Wrapper (Logic & Logging)

**Datei:** `src/lib/server-utils.ts`

Der Wrapper kapselt die Ausführung der Business-Logik und kümmert sich um das Fehler-Logging.

```typescript
export async function wrapPublicServerAction<T>(
  serverFunctionName: string,
  fn: () => Promise<T>,
  options: PublicLogOptions,
): Promise<UdNoServerResponse<T>> { ... }

export async function wrapProtectedServerAction<T>(
  serverFunctionName: string,
  fn: () => Promise<T>,
  options: ProtectedLogOptions,
): Promise<UdNoServerResponse<T>> { ... }

export async function wrapServerAction<T>(
  serverFuncionName: string,
  fn: () => Promise<T>,
  options: ProtectedLogOptions | PublicLogOptions,
) {
  if ('session' in options) {
    return wrapProtectedServerAction(serverFuncionName, fn, options)
  } else {
    return wrapPublicServerAction(serverFuncionName, fn, options)
  }
}

export function createServerActionOptions(
  metadata = EMPTY_CLIENT_LOGGING_METADATA,
  session?: Session | null,
) {
  return { session: session?.session, metadata }
}
```

Wichtige Punkte:

- `wrapServerAction` entscheidet automatisch, ob es sich um eine geschützte oder öffentliche Aktion handelt.
- Fehler werden mit `logToDb` gespeichert.
- Bei geschützten Aktionen wird zusätzlich `userId` mitgeloggt.
- `createServerActionOptions` liefert das gemeinsame Options-Objekt für `wrapServerAction`.

## Server Functions im aktuellen Code

**Datei:** `src/data/course.ts`

### Beispiel: `getCoursesFn`

```typescript
export const getCoursesFn = createServerFn({ method: 'GET' })
  .middleware([authFnMiddleware])
  .inputValidator((d: unknown) => withLogging(paginationSchema).parse(d))
  .handler(async ({ data, context }) => {
    const {
      page = PAGINATION_DEFAULTS.page,
      pageSize = PAGINATION_DEFAULTS.pageSize,
      search = PAGINATION_DEFAULTS.search,
    } = data

    return await wrapServerAction(
      'getCoursesFn',
      async () => {
        const skip = (page - 1) * pageSize
        const take = pageSize
        const [courses, totalCount] = await Promise.all([ ... ])
        return { items: courses, totalCount }
      },
      createServerActionOptions(data.loggingMetadata, context.session),
    )
  })
```

### Beispiel: `getCourseById`

```typescript
export const getCourseById = createServerFn({ method: 'GET' })
  .middleware([authFnMiddleware])
  .inputValidator((d: unknown) =>
    withLogging(z.object({ id: z.string() })).parse(d),
  )
  .handler(async ({ context, data }) => {
    return await wrapServerAction(
      'getCourseById',
      async () => {
        const userId = context.session.user.id
        const { id } = data
        const course = await prisma.course.findUnique({ ... })
        if (!course) throw notFound()
        return course
      },
      createServerActionOptions(data.loggingMetadata, context.session),
    )
  })
```

`createServerActionOptions` stellt hier sicher, dass die `loggingMetadata` aus dem Request zusammen mit der Session weitergereicht wird.

## Import einer HTML-Datei mit `FormData`

**Datei:** `src/data/import-export.ts`

Aktuell wird für den HTML-Import `FormData` erwartet und `loggingMetadata` aus dem FormData-Body extrahiert.

```typescript
.inputValidator(async (data: unknown) => {
  if (!(data instanceof FormData)) {
    throw new Error('Expected FormData')
  }

  const file = data.get('file') as File
  if (!file || file.type !== 'text/html') {
    throw new Error('Only HTML files are allowed.')
  }
  if (file.size > MAX_FILE_SIZE_UPLOAD) {
    throw new Error('File too large.')
  }

  const rawLogging = data.get('loggingMetadata')
  let loggingMetadata = EMPTY_CLIENT_LOGGING_METADATA
  if (rawLogging && typeof rawLogging === 'string') {
    try {
      loggingMetadata = JSON.parse(rawLogging)
    } catch (e) {
      // invalid JSON wird ignoriert
    }
  }

  return {
    file,
    loggingMetadata,
  }
})
```

Im Handler wird die eigentliche Import-Logik dann mit `wrapServerAction` ausgeführt:

```typescript
return await wrapServerAction(
  'importHtmlFile',
  async () => {
    // ... Import- und Prisma-Logik ...
  },
  createServerActionOptions(loggingMetadata, context.session),
)
```

Damit wird sichergestellt, dass auch Upload-Server-Funktionen konsistente Logging-Metadaten und Fehler-Antworten liefern.

## Hinweis zu `loggingMetadata`

Das Projekt nutzt zusätzlich in `src/lib/constants.ts`:

```typescript
export const MISSING_COMPONENT_NAME = '<no component provided>'
export const EMPTY_CLIENT_LOGGING_METADATA: ClientLoggingMetadata = {
  component: MISSING_COMPONENT_NAME,
}
```

Das bedeutet: Wenn keine Komponente mitgesendet wurde, wird trotzdem ein Platzhalter-Name geloggt, damit alle Logs einen `component`-Wert besitzen.
