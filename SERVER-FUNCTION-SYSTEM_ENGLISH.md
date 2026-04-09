# Server Function System

**Version:** 26.409.1

This document describes the current Server Function System in the project. It is designed so that all server functions:

- use a uniform return type,
- automatically log errors to the database,
- optionally support metadata from the calling component,
- and enable both protected and public Server Actions.

Open Todos:

- How can errors in the `inputValidator` also be logged to the database without having to do this manually in every single `inputValidator`?
- `loggingMetaSchema` and `withLogging` currently still have the component hard-coded. This should also be adapted to the `ClientLoggingMetadata` type.

---

## The Data Model (Prisma)

**File:** `prisma/schema.prisma`

The Log model stores errors centrally in the PostgreSQL/Neon database. We separate `serverFunction` (name of the logic) and `component` (location in the UI) to quickly see which flow was affected during debugging.

```prisma
model Log {
  id             String  @id @default(uuid())
  component      String? // Frontend component (optional when calling)
  serverFunction String? // Name of the Server Function (automatic)
  severity       String? // info, warning, error, critical
  message        String? // Error message or info text

  userId String? @map("user_id")
  user   User?   @relation(fields: [userId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("log")
}
```

## The Uniform Return Type

**File:** `src/types/api.ts`

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

## Logging Metadata and Validator

**File:** `src/schemas/api-utils.ts`

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

`withLogging` ensures that a missing input object is treated as `{}`, so that optional fields and defaults continue to work.

## Server Action Wrapper (Logic & Logging)

**File:** `src/lib/server-utils.ts`

The wrapper encapsulates the execution of the business logic and handles error logging.

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

Important points:

- `wrapServerAction` automatically decides whether it is a protected or public action.
- Errors are saved using `logToDb`.
- For protected actions, the `userId` is also logged.
- `createServerActionOptions` provides the shared options object for `wrapServerAction`.

## Server Functions in current code

**File:** `src/data/course.ts`

### Example: `getCoursesFn`

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

### Example: `getCourseById`

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

`createServerActionOptions` ensures here that the `loggingMetadata` from the request is passed along with the session.

## Import an HTML file with `FormData`

**File:** `src/data/import-export.ts`

Currently, `FormData` is expected for the HTML import and `loggingMetadata` is extracted from the FormData body.

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
      // invalid JSON is ignored
    }
  }

  return {
    file,
    loggingMetadata,
  }
})
```

In the handler, the actual import logic is then executed with `wrapServerAction`:

```typescript
return await wrapServerAction(
  'importHtmlFile',
  async () => {
    // ... Import and Prisma logic ...
  },
  createServerActionOptions(loggingMetadata, context.session),
)
```

This ensures that upload server functions also provide consistent logging metadata and error responses.

## Note on `loggingMetadata`

The project also uses the following in `src/lib/constants.ts`:

```typescript
export const MISSING_COMPONENT_NAME = '<no component provided>'
export const EMPTY_CLIENT_LOGGING_METADATA: ClientLoggingMetadata = {
  component: MISSING_COMPONENT_NAME,
}
```

This means: if no component was sent, a placeholder name is still logged so that all logs have a `component` value.
