# Server Function System

**Version:** 26.414.1

This document describes the architecture for server communication in this application. The system ensures that every request is traceable across all layers (Client -> Middleware -> Server -> DB), errors are handled securely, and **no server code (such as Prisma or secrets) leaks into the browser bundle**.

---

## 1. Tracing & Logging (Data Model)

Every log entry in the database can be uniquely mapped to a client request via the `request_id`. The schema allows correlation between frontend components and server logic.

```prisma
// prisma/schema.prisma
model Log {
  id              String   @id @default(uuid())
  component       String?  // Frontend component (e.g., "CourseCard")
  serverFunction  String?  @map("server_function") // Name of the Fn (e.g., "deleteCourseByIdFn")
  severity        String?  // info, warning, error, critical
  message         String?  // Masked or technical message

  requestId       String?  @map("request_id")
  correlationId   String?  @map("correlation_id")

  userId          String?  @map("user_id")
  user            User?    @relation(fields: [userId], references: [id], onDelete: Cascade)

  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@map("log")
}
```

---

## 2. Communication Types

We use an **Intersection** type so that the tracing IDs are always available in both success and error cases.

```typescript
// src/types/api.ts
export type ActionResponse<T = void> = {
  requestId?: string
  correlationId?: string
} & (
  | { success: true; data: T; message?: string }
  | { success: false; error: string }
)
```

---

## 3. Server-Side Architecture

### Fabrics (Server Function Factories)

To keep tracing and middlewares consistent, Server Functions are created exclusively via predefined fabrics in `src/lib/rpc.ts` (or `server-utils.ts`).

| Fabric        | Method | Protection | Included Middlewares                      |
| :------------ | :----- | :--------- | :---------------------------------------- |
| `publicFn`    | POST   | Public     | `requestIdMiddleware`                     |
| `publicGetFn` | GET    | Public     | `requestIdMiddleware`                     |
| `authFn`      | POST   | Protected  | `requestIdMiddleware`, `authFnMiddleware` |
| `authGetFn`   | GET    | Protected  | `requestIdMiddleware`, `authFnMiddleware` |

### The File-Splitting Pattern (Testability & Client Protection)

To prevent server code from leaking into the client bundle (`[import-protection] Import denied`) and to guarantee 100% testability, we physically separate the business logic into two files:

1.  **`*.logic.server.ts` (Pure Business Logic):** Contains the actual DB interaction. This file is **never** imported by the frontend. Normal top-level imports (`import { prisma } ...`) are explicitly allowed here.
2.  **`*.ts` (Transport & Server Function):** Serves as the "Entry Point" for the client, defines types, Zod schemas, and the RPC wrapper. The logic file is imported here **exclusively dynamically within the handler**.

```typescript
// 1. PURE BUSINESS LOGIC (src/data/course.logic.server.ts)
// -> Top-level imports of server packages are safe and intended here!
import { prisma } from '#/lib/db.server'
import { ServerActionError } from '#/types/errors'
import type { CourseIdInput } from './course'

export const deleteCourseByIdLogic = async (
  data: CourseIdInput,
  userId: string,
) => {
  const { id } = data
  const course = await prisma.course.findUnique({
    where: { id, userId },
  })

  if (!course) throw new ServerActionError('Course not found.')

  await prisma.course.delete({ where: { id } })
  return 'Course successfully deleted.'
}
```

```typescript
// 2. TRANSPORT & INFRASTRUCTURE (src/data/course.ts)
// -> Imported by the client. No top-level server imports!
import { authFn } from '#/lib/rpc'
import { courseIdSchema } from './schemas' // Example

export const deleteCourseByIdFn = authFn
  .inputValidator(courseIdSchema)
  .handler(async ({ context, data }) => {
    // Dynamic imports INSIDE the handler protect the client bundle
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    const { deleteCourseByIdLogic } = await import('./course.logic.server')

    return await wrapServerAction(
      'deleteCourseByIdFn',
      context, // Contains requestId, correlationId, and session
      data, // Contains loggingMetadata
      async () => {
        return deleteCourseByIdLogic(data, context.session.user.id)
      },
    )
  })
```

---

## 4. Client-Side Handling

### The `handleAction` Utility

In the frontend, all Server Function calls are processed via `handleAction` (in `src/lib/client-utils.ts`). This controls the UI feedback via **Sonner Toasts**.

- **Success:** Shows a green toast (disappears after 5s).
- **Client Error (Safe):** Shows a red toast (disappears after 5s).
- **Server Error (Hard):** - The toast remains permanently visible (`duration: Infinity`).
  - Displays the `requestId` as a reference.
  - Provides a **"Copy ID"** button.
  - **UX Optimization:** Upon clicking "Copy", the ID is copied to the clipboard, a "Copied" success toast is shown, and the original error toast is immediately closed (`dismiss`).

---

## 5. Best Practices & Rules

1.  **File-Splitting is mandatory:** Outsource all database and backend logic into `*.logic.server.ts` files. Use the normal `*.ts` files only for schemas, types, and the `createServerFn`/`authFn` wrappers.
2.  **Dynamic Handler Imports:** Always import helper functions like `wrapServerAction` and your logic dynamically (`await import(...)`) within the `.handler()` callback in the transport files.
3.  **Client-Safe Prisma Types:** If the frontend requires Prisma payload types (incl. includes), define them explicitly in the transport file (`*.ts`) and exclusively use `import type { Prisma } from '#/generated/prisma/client'`. This satisfies the compiler without importing runtime code.
4.  **Consistent Naming:** All Server Functions (the wrappers in the transport files) must consistently end with **`Fn`** (e.g., `getCourseByIdFn`) so they are immediately recognized as RPC endpoints in the client.
5.  **Input Validation:** Use `.inputValidator(schema)` with Zod schemas created via `withLogging(baseSchema)`.
6.  **GET for Queries:** Use `authGetFn` for pure data fetching (queries) to enable browser caching and URL parameter support (in conjunction with TanStack Router `validateSearch`).
7.  **Error Typing:** Use `ServerActionError` for validation errors that the user should see directly. Use standard `Error` for technical problems that must be masked by `wrapServerAction`.
