````markdown
# Server Function System

**Version:** 26.410.1

This document describes the current Server Function System in the project. It is designed so that all Server Functions:

- guarantee maximum TypeScript inference for the client (no anonymous functions in validators),
- use a unified return type (`UdNoServerResponse`),
- automatically log errors to the database,
- transport UI-friendly errors to the client via `ServerActionError`,
- support metadata from the calling component.

---

## The Data Model (Prisma)

**File:** `prisma/schema.prisma`

The Log model centrally stores errors in the PostgreSQL/Neon database. We separate `serverFunction` (name of the logic) and `component` (location in the UI) to quickly see which flow was affected during debugging.

```prisma
model Log {
  id             String  @id @default(uuid())
  component      String? // Frontend component (optional on call)
  serverFunction String? // Name of the Server Function (automatic)
  severity       String? // info, warning, error, critical
  message        String? // Error message or info text
  feature        String? // Feature that triggered the error
  actionSource   String? // Element that triggered the error, e.g., the clicked button

  userId String? @map("user_id")
  user   User?   @relation(fields: [userId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("log")
}
```
````

## The Unified Return Type & Client Logging

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

// Example for standardized IDs:
export const idSchema = z.object({ id: z.string().min(1) })
export const courseIdSchema = withLogging(idSchema)
```

**Important:** The Zod schema is now passed _directly_ to the validator so as not to destroy type inference on the client.

## Server Action Wrapper & Error Handling

**File:** `src/lib/server-utils.ts`

The wrapper encapsulates the execution of the business logic. For errors that should be displayed directly as a toast in the frontend, we use `ServerActionError`. All other errors (like 500s) are logged and packaged generically.

```typescript
export class ServerActionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ServerActionError'
  }
}

export async function wrapServerAction<T>(
  serverFunctionName: string,
  context: any, // Contains session etc.
  data: any, // Contains loggingMetadata
  fn: () => Promise<T>,
  successMessage?: string,
): Promise<UdNoServerResponse<T>> {
  // ... internal logic:
  // 1. Executes fn()
  // 2. Catches ServerActionError -> success: false, error: message
  // 3. Catches other errors -> logToDb() -> success: false, error: "Something went wrong"
  // 4. On success -> success: true, data: result
}
```

## Server Functions in the Current Code

### Example: Simple Data Passing (`getCourseById`)

**File:** `src/data/course.ts`

**Rule:** Do not use anonymous arrow functions in `.inputValidator()`!

```typescript
import { createServerFn } from '@tanstack/react-start'
import { authFnMiddleware } from '#/middlewares/auth'
import { wrapServerAction, ServerActionError } from '#/lib/server-utils'
import { courseIdSchema } from '#/schemas/api-utils'
import { prisma } from '#/db'

export const getCourseById = createServerFn({ method: 'GET' })
  .middleware([authFnMiddleware])
  .inputValidator(courseIdSchema) // DIRECT passing for 100% type safety
  .handler(async ({ context, data }) => {
    return await wrapServerAction('getCourseById', context, data, async () => {
      const userId = context.session.user.id
      const { id } = data

      const course = await prisma.course.findUnique({
        where: { id, userId },
      })

      // Client-friendly error instead of notFound() redirect
      if (!course) throw new ServerActionError('Course could not be found.')

      return course
    })
  })
```

### Example: File Upload with `FormData` (`importHtmlFile`)

**File:** `src/data/import-export.ts`

For file uploads, the Zod schema is just the bouncer (`z.instanceof(FormData)`). The content validation (MIME type, file size) happens inside the wrapper.

```typescript
import { z } from 'zod'
import { EMPTY_CLIENT_LOGGING_METADATA } from '#/lib/constants'

const importHtmlSchema = z.instanceof(FormData)

export const importHtmlFile = createServerFn({ method: 'POST' })
  .middleware([authFnMiddleware])
  .inputValidator(importHtmlSchema)
  .handler(async ({ data, context }) => {
    // 1. Extract LoggingMetadata BEFORE the wrapper
    let loggingMetadata = EMPTY_CLIENT_LOGGING_METADATA
    const rawLogging = data.get('loggingMetadata')
    if (typeof rawLogging === 'string') {
      try {
        loggingMetadata = JSON.parse(rawLogging)
      } catch (e) {}
    }

    // 2. Call wrapper
    return await wrapServerAction(
      'importHtmlFile',
      context,
      { loggingMetadata },
      async () => {
        // 3. Perform content validation HERE
        const file = data.get('file') as File | null
        if (!file || file.type !== 'text/html') {
          throw new ServerActionError('Only HTML files are allowed.')
        }
        if (file.size > MAX_FILE_SIZE_UPLOAD) {
          throw new ServerActionError('The file is too large.')
        }

        // ... Import and Prisma logic ...
        return { success: true }
      },
    )
  })
```

## Client-Side Integration (Frontend)

**File:** `src/lib/client-utils.ts` (and UI components)

To cleanly evaluate the unified structure on the client and display automatic toasts, server mutation calls are wrapped with the `handleAction` utility.

**Example in a component (`Tag.tsx`):**

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
          { successToast: 'Tag successfully deleted' },
        )
      } catch (error) {
        // Leave empty: handleAction catches the error and automatically throws the toast
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
