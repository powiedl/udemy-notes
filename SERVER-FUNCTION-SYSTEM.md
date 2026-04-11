# Server Function System

**Version:** 26.411.1

Dieses Dokument beschreibt die Architektur für die Server-Kommunikation in dieser Applikation. Das System stellt sicher, dass jeder Request über alle Ebenen hinweg (Client -> Middleware -> Server -> DB) rückverfolgbar ist und Fehler sicher sowie benutzerfreundlich behandelt werden.

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

**Wichtig:** Man muss die verwendete Middleware explizit bei der Fabric angeben, man darf beispielsweise kein Array `PUBLIC_MIDDLEWARE` und `AUTH_MIDDLEWARE` machen, in diese die Middlewares eintragen und dann das Array als Parameter für .middleware verwenden (wenn man das macht, erkennt Typescript die Typen nicht mehr sauber!)

### Der Wrapper: `wrapServerAction`

Jede Business-Logik innerhalb eines Handlers wird in `wrapServerAction` gehüllt.

1.  **Logging:** Schreibt bei Fehlern automatisch einen Eintrag in die `Log`-Tabelle.
2.  **Error Masking:** Wandelt unerwartete Fehler in eine generische Nachricht um ("Ein interner Fehler ist aufgetreten"), während `ServerActionError`s (sichere Fehler) durchgereicht werden.
3.  **Tracing:** Reichert die Antwort mit der `requestId` aus dem Context an.

```typescript
// Beispiel: Implementierung einer geschützten Action
export const deleteCourseById = authFn
  .inputValidator(courseIdSchema)
  .handler(async ({ context, data }) => {
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

```tsx
// Beispiel: Nutzung in einer Komponente
const onDelete = async (id: string) => {
  const result = await handleAction(
    deleteCourseById({
      id,
      loggingMetadata: { component: 'CourseCard' },
    }),
  )

  if (result) {
    // Weiterführende Logik bei Erfolg (result entspricht result.data)
  }
}
```

---

## 5. Best Practices & Regeln

1.  **Kein direktes `createServerFn`:** Nutze immer die Fabrics, damit die Middleware-Kette (Tracing) nicht unterbrochen wird.
2.  **Input Validierung:** Nutze `.inputValidator(schema)` mit Zod-Schemas, die via `withLogging(baseSchema)` erstellt wurden.
3.  **GET für Queries:** Verwende `authGetFn` für reine Datenabfragen (Queries), um Browser-Caching und URL-Parameter-Support zu ermöglichen.
4.  **Fehler-Typing:** Nutze `ServerActionError` für Validierungsfehler, die der User direkt sehen soll. Nutze Standard-`Error` für technische Probleme, die maskiert werden müssen.
