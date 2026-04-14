# Server Function System

**Version:** 26.414.1

Dieses Dokument beschreibt die Architektur für die Server-Kommunikation in dieser Applikation. Das System stellt sicher, dass jeder Request über alle Ebenen hinweg (Client -> Middleware -> Server -> DB) rückverfolgbar ist, Fehler sicher behandelt werden und **kein Server-Code (wie Prisma oder Secrets) in den Browser-Bundle gelangt**.

---

## 1. Tracing & Logging (Datenmodell)

Jeder Log-Eintrag in der Datenbank ist über die `request_id` eindeutig einem Client-Aufruf zuordenbar. Das Schema erlaubt die Korrelation zwischen Frontend-Komponenten und Server-Logik.

```prisma
// prisma/schema.prisma
model Log {
  id              String   @id @default(uuid())
  component       String?  // Frontend-Komponente (z.B. "CourseCard")
  serverFunction  String?  @map("server_function") // Name der Fn (z.B. "deleteCourseByIdFn")
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

Um Tracing und Middlewares konsistent zu halten, werden Server Functions ausschließlich über vordefinierte Fabrics in `src/lib/rpc.ts` (oder `server-utils.ts`) erstellt.

| Fabric        | Methode | Schutz     | Enthaltene Middlewares                    |
| :------------ | :------ | :--------- | :---------------------------------------- |
| `publicFn`    | POST    | Öffentlich | `requestIdMiddleware`                     |
| `publicGetFn` | GET     | Öffentlich | `requestIdMiddleware`                     |
| `authFn`      | POST    | Geschützt  | `requestIdMiddleware`, `authFnMiddleware` |
| `authGetFn`   | GET     | Geschützt  | `requestIdMiddleware`, `authFnMiddleware` |

### Das File-Splitting Pattern (Testbarkeit & Client-Schutz)

Um Ausbrechversuche von Server-Code in den Client-Bundle (`[import-protection] Import denied`) zu verhindern und eine 100%ige Testbarkeit zu garantieren, trennen wir die **Business Logik** physisch in zwei Dateien auf:

1.  **`*.logic.server.ts` (Reine Business Logik):** Enthält die eigentliche DB-Interaktion. Diese Datei wird **niemals** vom Frontend importiert. Hier sind normale Top-Level-Imports (`import { prisma } ...`) ausdrücklich erlaubt.
2.  **`*.ts` (Transport & Server Function):** Dient als "Entry Point" für den Client, definiert Typen, Zod-Schemas und die RPC-Hülle. Die Logik-Datei wird hier **ausschließlich dynamisch im Handler** importiert.

```typescript
// 1. REINE BUSINESS LOGIK (src/data/course.logic.server.ts)
// -> Top-Level Imports von Server-Paketen sind hier sicher und gewollt!
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

  if (!course) throw new ServerActionError('Kurs nicht gefunden.')

  await prisma.course.delete({ where: { id } })
  return 'Kurs erfolgreich gelöscht.'
}
```

```typescript
// 2. TRANSPORT & INFRASTRUKTUR (src/data/course.ts)
// -> Wird vom Client importiert. Keine Top-Level Server-Imports!
import { authFn } from '#/lib/rpc'
import { courseIdSchema } from './schemas' // Beispiel

export const deleteCourseByIdFn = authFn
  .inputValidator(courseIdSchema)
  .handler(async ({ context, data }) => {
    // Dynamische Imports INSIDE handler schützen den Client-Bundle
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    const { deleteCourseByIdLogic } = await import('./course.logic.server')

    return await wrapServerAction(
      'deleteCourseByIdFn',
      context, // Enthält requestId, correlationId und session
      data, // Enthält loggingMetadata
      async () => {
        return deleteCourseByIdLogic(data, context.session.user.id)
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

1.  **File-Splitting ist Pflicht:** Lagere jegliche Datenbank- und Backendlogik in `*.logic.server.ts`-Dateien aus. Nutze die normalen `*.ts`-Dateien nur für Schemas, Typen und die `createServerFn`/`authFn`-Wrapper.
2.  **Dynamische Handler-Imports:** Importiere Hilfsfunktionen wie `wrapServerAction` und deine Logik in den Transport-Dateien **immer dynamisch** (`await import(...)`) innerhalb des `.handler()`-Callbacks.
3.  **Client-Sichere Prisma-Typen:** Wenn das Frontend Prisma-Payload-Typen (inkl. Includes) benötigt, definiere diese explizit in der Transport-Datei (`*.ts`) und nutze ausschließlich `import type { Prisma } from '#/generated/prisma/client'`. So wird der Compiler befriedigt, ohne Laufzeit-Code zu importieren.
4.  **Einheitliche Namensgebung:** Alle Server Functions (die Hüllen in den Transport-Dateien) müssen konsistent auf **`Fn`** enden (z.B. `getCourseByIdFn`), damit sie im Client sofort als RPC-Endpunkt erkannt werden.
5.  **Input Validierung:** Nutze `.inputValidator(schema)` mit Zod-Schemas, die via `withLogging(baseSchema)` erstellt wurden.
6.  **GET für Queries:** Verwende `authGetFn` für reine Datenabfragen (Queries), um Browser-Caching und URL-Parameter-Support (in Verbindung mit TanStack Router `validateSearch`) zu ermöglichen.
7.  **Fehler-Typing:** Nutze `ServerActionError` für Validierungsfehler, die der User direkt sehen soll. Nutze Standard-`Error` für technische Probleme, die durch `wrapServerAction` maskiert werden müssen.
