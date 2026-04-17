# Server Function System

**Version:** 26.417.1

This document describes the architecture, the strict separation of client and server code, the communication types, and the comprehensive error handling for our Server Functions within the TanStack Start application.

Our system is based on a strict separation of layers and a **two-layer model** ("Scalpel and Safety Net") for error handling. This ensures that developers have maximum context during logging, while the system never leaks sensitive data or crashes uncontrollably.

---

## 1. Strict File Separation (Client vs. Server)

To prevent server code (such as Prisma ORM or Node modules) from "leaking" into the client bundle and to avoid issues with the Vite bundler (`@tanstack/start-vite-plugin`), we utilize strict file splitting:

1.  **`*.logic.server.ts` (Pure Business Logic):** Contains the actual database interaction. This file is **never** imported by the frontend. Normal top-level imports (`import { prisma } ...`) are explicitly allowed here.
2.  **`*.ts` (Transport & Server Function):** Serves as the "Entry Point" for the client, defining types, Zod schemas, and the RPC shell. The logic file and wrapper functions are imported here **exclusively dynamically within the handler**.

---

## 2. Communication Types

To ensure that the client and server communicate in a type-safe and predictable manner, we use a standardized return interface for all mutations and complex logic calls.

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

For known, user-caused errors (e.g., validation, missing permissions) that can be safely sent to the frontend, a specific error class exists:

```typescript
export class ServerActionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ServerActionError'
  }
}
```

---

## 3. Server Function Fabrics (The Factories)

In the `src/lib/rpc.ts` file (or similar), we define base factories that serve as the foundation for all server calls. **All factories now build upon `baseServerFn`** to inherit the global safety net for error handling.

| Fabric         | HTTP Method     | Auth Required? | Description / Use Case                                                                                                                      |
| :------------- | :-------------- | :------------- | :------------------------------------------------------------------------------------------------------------------------------------------ |
| `baseServerFn` | POST (Standard) | No             | The absolute base. Includes the global error middleware. Used directly for public endpoints (e.g., Login) or as a base for other factories. |
| `authGetFn`    | GET             | Yes            | For fetching data (Queries). Checks the session. Results can be cached by the browser/router.                                               |
| `authPostFn`   | POST            | Yes            | For mutations (Create, Update, Delete). Checks the session.                                                                                 |

_Example of creating a function in the transport file (`_.ts`):\*

```typescript
import { authGetFn } from '#/lib/rpc'

export const getNotesFn = authGetFn
  .inputValidator(getNotesSchema)
  .handler(async ({ data, context }) => {
    // Dynamic import protects the client bundle!
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    const { getNotesLogic } = await import('./note.logic.server')

    return await wrapServerAction('getNotesFn', context, data, async () => {
      return getNotesLogic(data, context.session.user.id)
    })
  })
```

---

## 4. The Error Handling System (Two-Layer Model)

To maximize security and traceability, we separate error handling into two interlocking levels:

### Layer 1: The Global Middleware (The Safety Net)

Located at the very top of the network edge (`rpc.ts`). It catches everything that crashes due to Zod validation or was accidentally thrown by developers outside of the deep logic.

```typescript
// src/lib/rpc.ts
import { createMiddleware, createServerFn } from '@tanstack/start'
import { ServerActionError } from '#/types/errors'
import { SERVER_ERROR_SANITIZED_MESSAGE } from '#/lib/constants'

export async function handleGlobalError(error: any): Promise<never> {
  const isSafeError = error instanceof ServerActionError
  const isZodError = error?.name === 'ZodError'

  console.error('[GlobalErrorHandler] UNCAUGHT:', error)

  // 1. Log EVERYTHING (Dynamic import to protect client bundle)
  const { logToDb } = await import('#/lib/logging.server')
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

  // 2. Apply Error Masking or throw original
  if (isSafeError || isZodError) {
    throw error // Must reach the client so UI (e.g., forms) can react
  } else {
    throw new Error(SERVER_ERROR_SANITIZED_MESSAGE) // Maintain secrecy
  }
}

export const errorHandlingMiddleware = createMiddleware().server(
  async ({ next }) => {
    try {
      return await next()
    } catch (error: any) {
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

Used as a wrapper within the transport file handler. It has full access to the request context. If an error occurs in the executing logic, it logs it in detail and returns a controlled `ActionResponse` object. It **does not re-throw errors**, which is why the global middleware does not intervene here.

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

On the frontend, we use a standardized utility function to process the `ActionResponse` objects returned by the server uniformly. It automatically handles toast notifications and extracts the payloads.

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
    // Catches errors thrown directly (e.g., from the global ErrorHandler)
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
  await handleAction(updateProfileFn({ data: values }), {
    showSuccessToast: true,
    onSuccess: (data) => {
      // Reset form, refresh router, etc.
    },
  })
}
```
