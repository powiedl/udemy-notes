````markdown
# Server Function System

**Version:** 26.418.1

This document describes the architecture, the strict separation of client and server code, the communication types, and the comprehensive error handling for our Server Functions in the TanStack Start application.

Our system is based on a **strict separation between client and server** and a **two-layer model** ("scalpel and safety net") for error handling, which guarantees that developers have maximum context for logging, but the system never leaks sensitive data or crashes uncontrollably.

---

## 1. Strict File Separation (Client vs. Server)

To prevent server code (like the Prisma ORM or Node modules) from "leaking" into the client bundle and to avoid problems with the Vite bundler (`@tanstack/start-vite-plugin`), we use a strict file splitting approach:

1. **`*.logic.server.ts` (Pure Business Logic):** Contains the actual DB interactions. This file is **never** imported by the frontend. Normal top-level imports (`import { prisma } ...`) are explicitly allowed here.
2. **`*.ts` (Transport & Server Function):** Serves as the "Entry Point" for the client, defines types, Zod schemas, and the RPC wrapper. The logic file as well as wrapper functions are imported here **exclusively dynamically inside the handler**.

---

## 2. Communication Types

To ensure that client and server communicate in a type-safe and predictable manner, we use a standardized return interface for all mutations and complex logic calls.

```typescript
// The standard interface for server responses
export type ActionResponse<T = void> = {
  requestId?: string
  correlationId?: string
} & (
  | { success: true; data: T; message?: string }
  | { success: false; error: string }
)
```
````

For known, user-caused errors (e.g., validation, missing permissions) that can safely be sent to the frontend, a dedicated error class exists:

```typescript
export class ServerActionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ServerActionError'
  }
}
```

---

## 3. Server Function Factories

In the `src/lib/rpc.ts` file (or similar), we define base factories that serve as the foundation for all server calls. **All factories now build upon `baseServerFn`** to inherit the global safety net for errors.

| Factory        | HTTP Method    | Auth required? | Description / Purpose                                                                                                                       |
| :------------- | :------------- | :------------- | :------------------------------------------------------------------------------------------------------------------------------------------ |
| `baseServerFn` | POST (Default) | No             | The absolute base. Includes the global error middleware. Used directly for public endpoints (e.g., Login) or as a base for other factories. |
| `authGetFn`    | GET            | Yes            | For loading data (Queries). Checks the session. Results can be cached by the browser/router.                                                |
| `authPostFn`   | POST           | Yes            | For mutations (Create, Update, Delete). Checks the session.                                                                                 |

### The `withLogging` Zod Schema (Important!)

So that our execution wrapper (`wrapServerAction`, see Layer 2) can log detailed UI metadata in the event of an error, the frontend must be allowed to pass these type-safely to the server.

To achieve this, we wrap **every** Zod schema in the transport file (`*.ts`) in our `withLogging` helper function. This automatically extends the base schema with the optional `loggingMetadata` field (`component`, `feature`, `actionSource`).

_Example for creating a function in the transport file (`_.ts`):\*

```typescript
import { z } from 'zod'
import { authGetFn } from '#/lib/rpc'
import { withLogging } from '#/schemas/api-utils' // Adjust path

// 1. Define schema and enrich with logging metadata
export const getNotesSchema = withLogging(
  z.object({
    courseId: z.string().optional(),
  }),
)

// 2. Assemble Server Function
export const getNotesFn = authGetFn
  .inputValidator(getNotesSchema)
  .handler(async ({ data, context }) => {
    // Dynamic import protects the client bundle!
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    const { getNotesLogic } = await import('./note.logic.server')

    // 'data' now type-safely contains our parameters AND the loggingMetadata
    return await wrapServerAction('getNotesFn', context, data, async () => {
      return getNotesLogic(data, context.session.user.id)
    })
  })
```

---

## 4. The Error Handling System (Two-Layer Model)

To maximize security and traceability, we separate error handling into two interlocking layers:

### Layer 1: The Global Middleware (The Safety Net)

Sits right at the top edge of the network (`rpc.ts`). It catches everything that crashes due to Zod validations or is accidentally thrown by developers outside the deep logic. However, since this needs to log to the database (and therefore must import prisma), we have to extract the actual logic back into a `*.server.ts` file.

```typescript
// src/lib/error-handler.server.ts
import { ServerActionError } from '#/types/errors'
import { SERVER_ERROR_SANITIZED_MESSAGE } from '#/lib/constants'
import { logToDb } from '#/lib/logging.server'

export async function handleGlobalError(error: any): Promise<never> {
  const isSafeError = error instanceof ServerActionError
  const isZodError = error?.name === 'ZodError'

  console.error('[GlobalErrorHandler] UNCAUGHT:', error)

  const realErrorMessage =
    error instanceof Error ? error.message : String(error)

  await logToDb({
    metadata: {
      component: 'Global-Error-Boundary',
      actionSource: 'Uncaught Exception',
    },
    serverFunction: isZodError ? 'Validator' : 'Unknown/Outside Action',
    severity: isSafeError || isZodError ? 'warning' : 'critical',
    message: realErrorMessage,
  }).catch((logError) => {
    console.error('Critical: Fallback log could not be written:', logError)
  })

  // 2. Apply error masking or throw original
  if (isSafeError || isZodError) {
    throw error // Must go to the client so UI (e.g. forms) can react
  } else {
    throw new Error(SERVER_ERROR_SANITIZED_MESSAGE) // Keep secrets hidden
  }
}
```

In **#/lib/rpc.ts** we create the corresponding middleware (where we dynamically import handleGlobalError inside `.server()` - which is "safe" because the bundler removes the content of `.server()` for the client image).

```typescript
// /src/lib/rpc.ts

export const errorHandlingMiddleware = createMiddleware().server(
  async ({ next }) => {
    try {
      return await next()
    } catch (error: any) {
      const { handleGlobalError } = await import('#/lib/error-handler.server')
      return await handleGlobalError(error)
    }
  },
)

// Base for ALL Server Functions!
export const baseServerFn = createServerFn().middleware([
  errorHandlingMiddleware,
])
```

### Layer 2: The Precision Tool (`wrapServerAction`)

Used as a wrapper inside the handler of the transport file. It has full access to the request context. If an error occurs within the executing logic, it logs it in detail and returns a controlled `ActionResponse` object. It **does not throw errors further up**, which is why the global middleware does not intervene here.

```typescript
// src/lib/server-utils.server.ts
export async function wrapServerAction<T>(
  actionName: string,
  context: {
    session?: { user: { id: string } } | null
    requestId: string
    correlationId: string
  },
  input: { loggingMetadata?: ClientLoggingMetadata },
  action: () => Promise<T>,
  successMessage?: string,
): Promise<ActionResponse<T>> {
  try {
    const data = await action()
    return {
      success: true,
      data,
      message: successMessage,
      requestId: context.requestId,
      correlationId: context.correlationId,
    }
  } catch (error: unknown) {
    const realErrorMessage =
      error instanceof Error ? error.message : String(error)

    // 1. Log technical error with IDs to the DB
    await logToDb({
      metadata: input.loggingMetadata ?? {},
      serverFunction: actionName,
      severity: 'error',
      message: realErrorMessage,
      userId: context?.session?.user?.id,
      requestId: context.requestId,
      correlationId: context.correlationId,
    }).catch(console.error)

    const isSafeError =
      error instanceof ServerActionError ||
      (error !== null &&
        typeof error === 'object' &&
        'isSafeForClient' in error)

    // 2. Error Masking
    const clientErrorMessage = isSafeError
      ? realErrorMessage
      : SERVER_ERROR_SANITIZED_MESSAGE

    return {
      success: false,
      error: clientErrorMessage,
      requestId: context.requestId,
      correlationId: context.correlationId,
    }
  }
}
```

---

## 5. Database Logging & Log Schema

**Every** error is logged in the database.

### Prisma Log Schema

```prisma
model Log {
  id             String   @id @default(cuid())
  createdAt      DateTime @default(now())
  component      String?
  serverFunction String?
  severity       String   // 'warning' | 'error' | 'critical'
  message        String
  userId         String?
  requestId      String?
  correlationId  String?
}
```

### The logToDb Function

```typescript
// src/lib/logging.server.ts
import { prisma } from '#/lib/db.server'

export async function logToDb(params: {
  metadata: ClientLoggingMetadata
  serverFunction?: string
  severity: LogSeverity
  message: string
  userId?: string
  requestId?: string
  correlationId?: string
}) {
  return await prisma.log.create({
    data: {
      component: params.metadata.component,
      serverFunction: params.serverFunction,
      severity: params.severity,
      message: params.message,
      userId: params.userId,
      requestId: params.requestId,
      correlationId: params.correlationId,
    },
  })
}
```

---

## 6. Client-Side Integration (`handleAction`)

On the frontend, we use a standardized helper function to uniformly process the `ActionResponse` objects returned by the server. It automatically handles toast notifications and extracts the payloads.

```typescript
// src/lib/client-utils.ts
import { toast } from 'sonner'
import { ActionResponse } from '#/types/api'

export async function handleAction<T>(
  actionPromise: Promise<ActionResponse<T>>,
  options?: {
    showSuccessToast?: boolean
    showErrorToast?: boolean
    onSuccess?: (data: T) => void
    onError?: (error: string) => void
  },
): Promise<T | null> {
  const {
    showSuccessToast = true,
    showErrorToast = true,
    onSuccess,
    onError,
  } = options || {}

  try {
    const result = await actionPromise

    if (result.success) {
      if (showSuccessToast && result.message) {
        toast.success(result.message)
      }
      if (onSuccess) onSuccess(result.data)
      return result.data
    } else {
      if (showErrorToast) {
        toast.error(result.error || 'An error occurred.')
      }
      if (onError) onError(result.error)
      return null
    }
  } catch (error) {
    // Catches errors that are thrown directly (e.g. by the global ErrorHandler)
    const errorMsg =
      error instanceof Error ? error.message : 'An unexpected error occurred.'
    if (showErrorToast) {
      toast.error(errorMsg)
    }
    if (onError) onError(errorMsg)
    return null
  }
}
```

**Example call in a React component:**

```tsx
const onSubmit = async (values: FormValues) => {
  await handleAction(
    updateProfileFn({
      data: values,
      loggingMetadata: {
        component: 'ProfileForm',
        actionSource: 'SubmitButton',
      },
    }),
    {
      showSuccessToast: true,
      onSuccess: (data) => {
        // Reset form, refresh router, etc.
      },
    },
  )
}
```

```

```
