# Server Function System

**Version:** 26.411.2

This document describes the architecture for server communication within this application. The system ensures that every request is traceable across all layers (Client -> Middleware -> Server -> DB), errors are handled securely, and **no server-only code (such as Prisma or secrets) leaks into the browser bundle**.

---

## 1. Tracing & Logging (Data Model)

Every log entry in the database is uniquely assignable to a client call via the `request_id`. The schema allows correlation between frontend components and server logic.

```prisma
// prisma/schema.prisma
model Log {
  id              String   @id @default(uuid())
  component       String?  // Frontend component (e.g., "CourseCard")
  serverFunction  String?  @map("server_function") // Name of the Fn (e.g., "deleteCourseById")
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

We use an **Intersection** to ensure that tracing IDs are always available in both success and error cases.

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

To keep tracing and middlewares consistent, Server Functions are created exclusively via predefined fabrics in `src/lib/server-utils.ts`.

| Fabric        | Method | Protection | Included Middlewares                      |
| :------------ | :----- | :--------- | :---------------------------------------- |
| `publicFn`    | POST   | Public     | `requestIdMiddleware`                     |
| `publicGetFn` | GET    | Public     | `requestIdMiddleware`                     |
| `authFn`      | POST   | Protected  | `requestIdMiddleware`, `authFnMiddleware` |
| `authGetFn`   | GET    | Protected  | `requestIdMiddleware`, `authFnMiddleware` |

### The Isolation Pattern (Leak Prevention)

To prevent server libraries (like Prisma) from being loaded into the client bundle, we consistently use **Dynamic Imports** within the handlers. Furthermore, every business logic block is wrapped in `wrapServerAction`.

**Important:** NEVER import server utilities at the top level of the file.

```typescript
// Example: Implementing a protected action with the Isolation Pattern
export const deleteCourseById = authFn
  .inputValidator(courseIdSchema)
  .handler(async ({ context, data }) => {
    // 1. Load server-only utilities ONLY INSIDE the handler
    const { prisma } = await import('#/lib/db.server')
    const { wrapServerAction } = await import('#/lib/server-utils.server')

    return await wrapServerAction(
      'deleteCourseById',
      context, // Contains requestId, correlationId, and session
      data, // Contains loggingMetadata
      async () => {
        const { id } = data
        const userId = context.session.user.id

        const course = await prisma.course.findUnique({ where: { id, userId } })
        if (!course) throw new ServerActionError('Course not found.')

        await prisma.course.delete({ where: { id } })
        return 'Course deleted successfully.'
      },
    )
  })
```

---

## 4. Client-Side Handling

### The `handleAction` Utility

In the frontend, all Server Function calls are processed via `handleAction` (in `src/lib/client-utils.ts`). This controls UI feedback via **Sonner Toasts**.

- **Success:** Displays a green toast (disappears after 5s).
- **Client Error (Safe):** Displays a red toast (disappears after 5s).
- **Server Error (Hard):** - The toast remains visible permanently (`duration: Infinity`).
  - Displays the `requestId` as a reference.
  - Provides a **"Copy ID"** button.
  - **UX Optimization:** Clicking "Copy" places the ID in the clipboard, shows a "Copied" success toast, and immediately closes the original error toast (`dismiss`).

---

## 5. Best Practices & Rules

1.  **No direct `createServerFn`:** Always use the fabrics to ensure the middleware chain (tracing) is not broken.
2.  **Strict Isolation:** **Never** import `prisma` or other `.server` modules at the beginning of the file. Always use `await import(...)` inside the handler.
3.  **Input Validation:** Use `.inputValidator(schema)` with Zod schemas created via `withLogging(baseSchema)`.
4.  **GET for Queries:** Use `authGetFn` for pure data fetches (Queries) to enable browser caching and URL parameter support.
5.  **Error Typing:** Use `ServerActionError` for validation errors that should be shown directly to the user. Use standard `Error` for technical issues that must be masked.
