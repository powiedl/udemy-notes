# Server Function System

**Version:** 26.518.1

This document describes the architecture, the strict separation of client and server code, the communication types, as well as the comprehensive error handling for our Server Functions in the TanStack Start application.

Our system is based on a **strict separation between client and server** and a **two-layer model** ("scalpel and safety net") for error handling, which guarantees that developers have maximum context during logging, but the system never leaks sensitive data or crashes uncontrollably.

## Naming Conventions

The following naming conventions have proven to be useful (unfortunately only during the course of development, which is why they are not followed across the board in the project):

- **Server Function Name**: Should always end with **Fn**. If a Server Function is then used in the frontend (with `useServerFn()`), it has the exact same name there (just without `Fn`). Example: Server Function `getNotesByCourseIdFn` is used in the client like this: `const getNotesByCourseId=useServerFn(getNotesByCourseIdFn)`.
- **Server Function Name and Logic Function**: For every Server Function, there must be a corresponding Logic function. The name of the Logic function is derived by replacing the **Fn** of the Server Function with **Logic**, so in the above example `getNotesByCourseIdLogic`.
- **Input Schema for Server Functions**: These are also used as the `inputValidator` for the Server Function. Their name should be exactly the same as the name of the Server Function (without Fn), followed by `InputSchema` (this leaves open the possibility of also defining an output schema for the function in the future). The derived TypeScript type has the exact same name, but with a capitalized first letter. For the previous example, this means: Schema: `getNotesByCourseIdInputSchema` and the derived TypeScript type: `GetNotesByCourseIdInputSchema`. This approach has one (small) disadvantage: If multiple Server Functions expect the same kind of input, you have to define the schemas and the TypeScript types identically multiple times. However, you can also define one schema (and TypeScript type) for this kind of input and then create "aliases" (or "copies") (I don't have a sensible system for this yet on how to know in the future whether a "matching" base schema already exists).
- **File Names**: There are different folders for different types of files where these files are gathered (the folder names are plural). The names inside the folders should also always contain the name of the folder (in singular) with a **.** before and after it, e.g., `course.data.ts`, `note.schema.ts`. **EXCEPTION**:
  - The logic functions are stored in files named **.logic.server.ts** (they are always located in the **data** folder, so you don't have to specify the name of the folder here as well).
  - The routes files also do not get **.routes.** in the file name.
- Folder names (and what they are used for):
  - **data**: Contains the Server Functions (both the transport and the logic functions).
  - **hooks**: Contains custom hooks.
  - **lib**: Contains "library" functions.
  - **middlewares**: Middlewares are defined here.
  - **routes**: Contains the file-based routes of TanStack Start.
  - **schemas**: Contains Zod schema definitions (and the TypeScript types based directly on the schemas).
  - **scripts**: Any helper scripts.
  - **types**: Contains **ONLY** TypeScript types or type aliases and interface definitions (i.e., only things that no longer exist in JavaScript).
  - **\_\_test\_\_**: Contains the tests for the files in the parent directory. The test file names must end with **.test.ts**.

---

## 1. Strict File Separation (Client vs. Server)

To prevent server code (like the Prisma ORM or Node modules) from "leaking" into the client bundle and to avoid issues with the Vite bundler (`@tanstack/start-vite-plugin`), we use strict file splitting:

1. **`*.logic.server.ts` (Pure Business Logic):** Contains the actual DB interaction. This file is **never** imported by the frontend. Normal top-level imports (`import { prisma } ...`) are explicitly allowed here.
2. **`*.ts` (Transport & Server Function):** Serves as an "entry point" for the client, defines types, Zod schemas, and the RPC wrapper. The logic file as well as wrapper functions are **exclusively imported dynamically in the handler** here.

---

## 2. Communication Types

To ensure client and server communicate with each other in a type-safe and predictable manner, we use a standardized return interface for all mutations and complex logic calls.

```typescript
// The standard interface for server responses
export type ActionResponse<T void> = {
  requestId?: string
  correlationId?: string
} & (
  | { success: true; data: T; message?: string }
  | { success: false; error: string }
)

```

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

## 3. Server Function Factories (The Factories)

In the file `src/lib/rpc.ts`, we define base factories that serve as the foundation for all server calls. **All factories are now built upon the `baseServerFn**` to inherit the global safety net for errors.

| Factory        | HTTP Method    | Auth required? | Description / Purpose                                                                                                                           |
| -------------- | -------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `baseServerFn` | POST (Default) | No             | The absolute baseline. Includes the global error middleware. Used directly for public endpoints (e.g., login) or as a base for other factories. |
| `authGetFn`    | GET            | Yes            | For loading data (Queries). Checks the session. Results can be cached by the browser/router.                                                    |
| `authFn`       | POST           | Yes            | For mutations (Create, Update, Delete). Checks the session.                                                                                     |
| `publicGetFn`  | GET            | No             | loading data (Queries). Checks the session. Results can be cached by the browser/router.                                                        |
| `publicFn`     | POST           | No             | For mutations (Create, Update, Delete) (actually just for the sake of completeness, who wants unauthorized mutations anyway).                   |

### The `withLogging` Zod Schema (Important!)

So that our execution wrapper (`wrapServerAction`, see Layer 2) can log detailed UI metadata in case of an error, the frontend must be allowed to pass this to the server in a type-safe manner.

To achieve this, we wrap **every** Zod schema in the transport file (`*.ts`) with our `withLogging` helper function. This automatically extends the base schema with the optional `loggingMetadata` field (`component`, `feature`, `actionSource`).

_Example of creating a function in the transport file (`_.ts`):_

```typescript
import { z } from 'zod'
import { authGetFn } from '#/lib/rpc'
import { withLogging } from '#/schemas/api-utils.schema'

// 1. Define schema and enrich with logging metadata - actually from (#/schemas/note.schema.ts)
export const getNotesInputSchema = withLogging(
  z.object({
    courseId: z.string().optional(),
  }),
)

// 2. Assemble Server Function
export const getNotesFn = authGetFn
  .inputValidator(getNotesInputSchema)
  .handler(async ({ data, context }) => {
    // Dynamic import protects the client bundle!
    const { wrapServerAction } = await import('#/lib/server-utils.lib.server')
    const { getNotesLogic } = await import('./note.logic.server')

    // 'data' now type-safely contains our parameters AND the loggingMetadata
    return await wrapServerAction('getNotesFn', context, data, async () => {
      return getNotesLogic(data, context.session.user.id)
    })
  })
```

---

## 4. The Error Handling System (Two-Layer Model)

To maximize safety and traceability, we separate error handling into two interlocking layers:

### Layer 1: The Global Middleware (The Safety Net)

Sits right at the top at the network edge (`rpc.ts`). It catches everything that crashes due to Zod validations or was accidentally thrown by developers outside the deep logic. However, since this should log into the database (and therefore needs to import prisma), we have to outsource the actual logic into a `.server.ts` file again.

```typescript
// src/lib/error-handler.server.ts
import { ServerActionError } from '#/types/errors'
import { SERVER_ERROR_SANITIZED_MESSAGE } from '#/lib/constants.lib'
import { logToDb } from '#/lib/logging.lib.server'

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
    console.error('FATAL: could not write fallback log', logError)
  })

  // 2. Apply Error Masking or throw original
  if (isSafeError || isZodError) {
    throw error // Must go to the client so UI (e.g., forms) can react
  } else {
    throw new Error(SERVER_ERROR_SANITIZED_MESSAGE) // Keep secret
  }
}
```

In **#/lib/rpc.lib.ts** we create the corresponding middleware (where we dynamically import handleGlobalError inside `.server()` - which is "safe" because the bundler removes the content of `.server()` for the client image).

```typescript
// /src/lib/rpc.lib.ts

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

Is used as a wrapper in the handler of the transport file. It has full access to the request context. If an error occurs in the executing logic, it logs this in detail and returns a controlled `ActionResponse` object. It **does not throw errors further**, which is why the global middleware does not intervene here.

```typescript
// src/lib/server-utils.lib.server.ts
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

    // 1. Log technical error with IDs into the DB
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

**Every** error is logged into the database.

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
// src/lib/logging.lib.server.ts
import { prisma } from '#/lib/db.lib.server'

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

On the frontend, we use a standardized helper function to handle the `ActionResponse` objects returned by the server uniformly. It automatically takes care of toast notifications and extracts the payloads.

```typescript
// src/lib/client-utils.lib.ts
import { toast } from 'sonner'
import { ActionResponse } from '#/types/api.type'

export async function handleAction<T>(
  actionPromise: Promise<ActionResponse<T>>,
  options?: {
    showSuccessToast?: boolean
    showErrorToast?: boolean
    onSuccess?: (data: T) => void
    onError?: (error: string) => void
  },
): Promise<T null |> {
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
        toast.error(result.error || 'An error occurred')
      }
      if (onError) onError(result.error)
      return null
    }
  } catch (error) {
    // Catches errors that are thrown directly (e.g., by the global ErrorHandler)
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
    updateProfile({
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
