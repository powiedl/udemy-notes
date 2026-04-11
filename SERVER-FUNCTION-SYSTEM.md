# Server Function System

**Version:** 26.411.2

Dieses Dokument beschreibt die Architektur für die Server-Kommunikation in dieser Applikation. Das System stellt sicher, dass jeder Request über alle Ebenen hinweg (Client -> Middleware -> Server -> DB) rückverfolgbar ist, Fehler sicher behandelt werden und **kein Server-Code (wie Prisma oder Secrets) in den Browser-Bundle gelangt**.

---

## 1. Tracing & Logging (Datenmodell)

Jeder Log-Eintrag in der Datenbank ist über die `request_id` eindeutig einem Client-Aufruf zuordenbar. Das Schema erlaubt die Korrelation zwischen Frontend-Komponenten und Server-Logik.

```prisma
// prisma/schema.prisma
model Log {
  id              String   @id @default(uuid())
  component       String?  // Frontend-Komponente (z.B. "CourseCard")
  serverFunction  String?  @map("server_function") // Name der Fn (z.B. "deleteCourseById")
  severity        String?  // info, warning, error, critical
  message         String?  // Maskierte oder technische Nachricht

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

## 2. Kommunikationstypen

Wir verwenden eine **Intersection**, damit die Tracing-IDs sowohl im Erfolgs- als auch im Fehlerfall immer verfügbar sind.

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

## 3. Server-Seitige Architektur

### Fabrics (Server Function Fabriken)

Um Tracing und Middlewares konsistent zu halten, werden Server Functions ausschließlich über vordefinierte Fabrics in `src/lib/server-utils.ts` erstellt.

| Fabric        | Methode | Schutz     | Enthaltene Middlewares                    |
| :------------ | :------ | :--------- | :---------------------------------------- |
| `publicFn`    | POST    | Öffentlich | `requestIdMiddleware`                     |
| `publicGetFn` | GET     | Öffentlich | `requestIdMiddleware`                     |
| `authFn`      | POST    | Geschützt  | `requestIdMiddleware`, `authFnMiddleware` |
| `authGetFn`   | GET     | Geschützt  | `requestIdMiddleware`, `authFnMiddleware` |

### Das Isolation Pattern (Leak Prevention)

Um zu verhindern, dass Server-Bibliotheken (wie Prisma) in den Client-Bundle geladen werden, verwenden wir innerhalb der Handler konsequent **Dynamic Imports**. Jede Business-Logik wird zudem in `wrapServerAction` gehüllt.

**Wichtig:** Importiere Server-Utilities NIEMALS auf Top-Level Ebene der Datei.

```typescript
// Beispiel: Implementierung einer geschützten Action mit Isolation Pattern
export const deleteCourseById = authFn
  .inputValidator(courseIdSchema)
  .handler(async ({ context, data }) => {
    // 1. Server-only Utilities erst INNERHALB des Handlers laden
    const { prisma } = await import('#/lib/db.server')
    const { wrapServerAction } = await import('#/lib/server-utils.server')

    return await wrapServerAction(
      'deleteCourseById',
      context, // Enthält requestId, correlationId und session
      data, // Enthält loggingMetadata
      async () => {
        const { id } = data
        const userId = context.session.user.id

        const course = await prisma.course.findUnique({ where: { id, userId } })
        if (!course) throw new ServerActionError('Kurs nicht gefunden.')

        await prisma.course.delete({ where: { id } })
        return 'Kurs erfolgreich gelöscht.'
      },
    )
  })
```

---

## 4. Client-Seitiges Handling

### Die `handleAction` Utility

Im Frontend werden alle Server Function Aufrufe über `handleAction` (in `src/lib/client-utils.ts`) verarbeitet. Dies steuert das UI-Feedback via **Sonner-Toasts**.

- **Erfolg:** Zeigt einen grünen Toast (verschwindet nach 5s).
- **Client-Fehler (Safe):** Zeigt einen roten Toast (verschwindet nach 5s).
- **Server-Fehler (Hard):** - Der Toast bleibt permanent sichtbar (`duration: Infinity`).
  - Zeigt die `requestId` als Referenz an.
  - Bietet einen **"ID kopieren"**-Button.
  - **UX-Optimierung:** Beim Klick auf "Kopieren" wird die ID in die Zwischenablage gelegt, ein "Kopiert"-Erfolgs-Toast gezeigt und der ursprüngliche Fehler-Toast sofort geschlossen (`dismiss`).

---

## 5. Best Practices & Regeln

1.  **Kein direktes `createServerFn`:** Nutze immer die Fabrics, damit die Middleware-Kette (Tracing) nicht unterbrochen wird.
2.  **Strict Isolation:** Importiere `prisma` oder andere `.server`-Module **niemals am Dateianfang**. Nutze immer `await import(...)` innerhalb des Handlers.
3.  **Input Validierung:** Nutze `.inputValidator(schema)` mit Zod-Schemas, die via `withLogging(baseSchema)` erstellt wurden.
4.  **GET für Queries:** Verwende `authGetFn` für reine Datenabfragen (Queries), um Browser-Caching und URL-Parameter-Support zu ermöglichen.
5.  **Fehler-Typing:** Nutze `ServerActionError` für Validierungsfehler, die der User direkt sehen soll. Nutze Standard-`Error` für technische Probleme, die maskiert werden müssen.
