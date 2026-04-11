# Server Function System

**Version:** 26.411.1

This document describes the architecture for server communication in this application. The system ensures that every request is traceable across all layers (Client -> Middleware -> Server -> DB) and that errors are handled securely and in a user-friendly manner.

---

## 1. Tracing & Logging (Data Model)

Every log entry in the database is uniquely assignable to a client call via the `request_id`. The schema allows correlation between frontend components and server logic.

```prisma
// prisma/schema.prisma
model Log {
  id              String   @id @default(uuid())
  component       String?  // Frontend component (e.g., "CourseCard")
  serverFunction  String?  @map("server_function") // Name of the function (e.g., "deleteCourseById")
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

We use an **Intersection** so that tracing IDs are always available in both success and error cases.

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

To keep tracing and middlewares consistent, server functions are created exclusively via predefined fabrics in `src/lib/server-utils.ts`.

| Fabric        | Method | Protection | Included Middlewares                      |
| :------------ | :----- | :--------- | :---------------------------------------- |
| `publicFn`    | POST   | Public     | `requestIdMiddleware`                     |
| `publicGetFn` | GET    | Public     | `requestIdMiddleware`                     |
| `authFn`      | POST   | Protected  | `requestIdMiddleware`, `authFnMiddleware` |
| `authGetFn`   | GET    | Protected  | `requestIdMiddleware`, `authFnMiddleware` |

**Important:** The middleware used must be explicitly specified in the fabric. You must not, for example, create an array like `PUBLIC_MIDDLEWARE` or `AUTH_MIDDLEWARE`, add the middlewares to it, and then use that array as a parameter for `.middleware` (if you do this, TypeScript will no longer correctly infer the types!).

### The Wrapper: `wrapServerAction`

Every piece of business logic within a handler is wrapped in `wrapServerAction`.

1.  **Logging:** Automatically creates an entry in the `Log` table when errors occur.
2.  **Error Masking:** Converts unexpected errors into a generic message ("An internal error has occurred"), while `ServerActionError`s (safe errors) are passed through.
3.  **Tracing:** Enriches the response with the `requestId` from the context.

```typescript
// Example: Implementation of a protected action
export const deleteCourseById = authFn
  .inputValidator(courseIdSchema)
  .handler(async ({ context, data }) => {
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

In the frontend, all server function calls are processed via `handleAction` (in `src/lib/client-utils.ts`). This controls the UI feedback via **Sonner toasts**.

- **Success:** Shows a green toast (disappears after 5s).
- **Client Error (Safe):** Shows a red toast (disappears after 5s).
- **Server Error (Hard):**
  - The toast remains permanently visible (`duration: Infinity`).
  - Displays the `requestId` as a reference.
  - Provides a **"Copy ID"** button.
  - **UX Optimization:** When "Copy ID" is clicked, the ID is placed on the clipboard, a "Copied" success toast is shown, and the original error toast is immediately closed (`dismiss`).

```tsx
// Example: Usage in a component
const onDelete = async (id: string) => {
  const result = await handleAction(
    deleteCourseById({
      id,
      loggingMetadata: { component: 'CourseCard' },
    }),
  )

  if (result) {
    // Further logic on success (result corresponds to result.data)
  }
}
```

---

## 5. Best Practices & Rules

1.  **No direct `createServerFn`:** Always use the fabrics so that the middleware chain (tracing) is not interrupted.
2.  **Input Validation:** Use `.inputValidator(schema)` with Zod schemas created via `withLogging(baseSchema)`.
3.  **GET for Queries:** Use `authGetFn` for pure data requests (queries) to enable browser caching and URL parameter support.
4.  **Error Typing:** Use `ServerActionError` for validation errors that the user should see directly. Use standard `Error` for technical issues that must be masked.
