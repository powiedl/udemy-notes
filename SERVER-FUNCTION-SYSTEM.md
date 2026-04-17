# Server Function System

**Version:** 26.417.1

Dieses Dokument beschreibt die Architektur, die strikte Trennung von Client- und Server-Code, die Kommunikationstypen sowie das umfassende Error-Handling für unsere Server Functions in der TanStack Start Applikation.

Unser System basiert auf einer strikten Trennung der Schichten und einem **Zwei-Schichten-Modell** ("Skalpell und Sicherheitsnetz") bei der Fehlerbehandlung, das garantiert, dass Entwickler maximalen Kontext beim Logging haben, aber das System niemals sensible Daten leakt oder unkontrolliert abstürzt.

---

## 1. Strikte Dateitrennung (Client vs. Server)

Um zu verhindern, dass Server-Code (wie das Prisma ORM oder Node-Module) in das Client-Bundle "leakt" und um Probleme mit dem Vite-Bundler (`@tanstack/start-vite-plugin`) zu vermeiden, nutzen wir ein striktes File-Splitting:

1. **`*.logic.server.ts` (Reine Business Logik):** Enthält die eigentliche DB-Interaktion. Diese Datei wird **niemals** vom Frontend importiert. Hier sind normale Top-Level-Imports (`import { prisma } ...`) ausdrücklich erlaubt.
2. **`*.ts` (Transport & Server Function):** Dient als "Entry Point" für den Client, definiert Typen, Zod-Schemas und die RPC-Hülle. Die Logik-Datei sowie Wrapper-Funktionen werden hier **ausschließlich dynamisch im Handler** importiert.

---

## 2. Kommunikationstypen (Communication Types)

Damit Client und Server typsicher und vorhersehbar miteinander sprechen, nutzen wir ein standardisiertes Return-Interface für alle Mutationen und komplexen Logik-Aufrufe.

```typescript
// Das Standard-Interface für die Antworten des Servers
export type ActionResponse<T = void> = {
  requestId?: string
  correlationId?: string
} & (
  | { success: true; data: T; message?: string }
  | { success: false; error: string }
)
```

Für bekannte, durch den Benutzer verursachte Fehler (z.B. Validierung, fehlende Rechte), die sicher an das Frontend gesendet werden dürfen, existiert eine eigene Fehlerklasse:

```typescript
export class ServerActionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ServerActionError'
  }
}
```

---

## 3. Server Function Fabrics (Die Fabriken)

In der Datei `src/lib/rpc.ts` (oder ähnlich) definieren wir Basis-Fabriken, die als Grundlage für alle Server-Aufrufe dienen. **Alle Fabriken bauen nun auf der `baseServerFn` auf**, um das globale Sicherheitsnetz für Fehler zu erben.

| Fabric         | HTTP-Methode    | Auth erforderlich? | Beschreibung / Einsatzzweck                                                                                                                                  |
| :------------- | :-------------- | :----------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `baseServerFn` | POST (Standard) | Nein               | Die absolute Basis. Beinhaltet die globale Fehler-Middleware. Wird direkt für öffentliche Endpunkte (z.B. Login) genutzt oder als Basis für andere Fabriken. |
| `authGetFn`    | GET             | Ja                 | Für das Laden von Daten (Queries). Prüft die Session. Ergebnisse können vom Browser/Router gecacht werden.                                                   |
| `authPostFn`   | POST            | Ja                 | Für Mutationen (Create, Update, Delete). Prüft die Session.                                                                                                  |

_Beispiel für die Erstellung einer Funktion in der Transport-Datei (`_.ts`):\*

```typescript
import { authGetFn } from '#/lib/rpc'

export const getNotesFn = authGetFn
  .inputValidator(getNotesSchema)
  .handler(async ({ data, context }) => {
    // Dynamischer Import schützt das Client-Bundle!
    const { wrapServerAction } = await import('#/lib/server-utils.server')
    const { getNotesLogic } = await import('./note.logic.server')

    return await wrapServerAction('getNotesFn', context, data, async () => {
      return getNotesLogic(data, context.session.user.id)
    })
  })
```

---

## 4. Das Fehlerbehandlungs-System (Zwei-Schichten-Modell)

Um die Sicherheit und Nachvollziehbarkeit zu maximieren, trennen wir die Fehlerbehandlung in zwei ineinandergreifende Ebenen:

### Schicht 1: Die Globale Middleware (Das Sicherheitsnetz)

Sitzt ganz oben an der Netzwerkkante (`rpc.ts`). Sie fängt alles ab, was durch Zod-Validierungen crasht oder von Entwicklern versehentlich außerhalb der tiefen Logik geworfen wurde.

```typescript
// src/lib/rpc.ts
import { createMiddleware, createServerFn } from '@tanstack/start'
import { ServerActionError } from '#/types/errors'
import { SERVER_ERROR_SANITIZED_MESSAGE } from '#/lib/constants'

export async function handleGlobalError(error: any): Promise<never> {
  const isSafeError = error instanceof ServerActionError
  const isZodError = error?.name === 'ZodError'

  console.error('[GlobalErrorHandler] UNCAUGHT:', error)

  // 1. ALLES loggen (Dynamischer Import zum Schutz des Client-Bundles)
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
    console.error(
      'Kritisch: Fallback-Log konnte nicht geschrieben werden:',
      logError,
    )
  })

  // 2. Error Masking anwenden oder im Original werfen
  if (isSafeError || isZodError) {
    throw error // Muss zum Client, damit UI (z.B. Formulare) reagieren kann
  } else {
    throw new Error(SERVER_ERROR_SANITIZED_MESSAGE) // Geheimnis wahren
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

// Basis für ALLE Server Functions!
export const baseServerFn = createServerFn().middleware([
  errorHandlingMiddleware,
])
```

### Schicht 2: Das Präzisionswerkzeug (`wrapServerAction`)

Wird als Hülle im Handler der Transport-Datei verwendet. Es hat vollen Zugriff auf den Request-Kontext. Wenn in der ausführenden Logik ein Fehler passiert, loggt es diesen detailliert und gibt ein kontrolliertes `ActionResponse` Objekt zurück. Es **wirft keine Fehler weiter**, weshalb die globale Middleware hier nicht eingreift.

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

    // 1. Technischen Fehler mit IDs in die DB loggen
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

## 5. Datenbank Logging & Log Schema

**Jeder** Fehler wird in der Datenbank protokolliert.

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

### Die logToDb Funktion

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

Am Frontend nutzen wir eine standardisierte Hilfsfunktion, um die vom Server zurückgegebenen `ActionResponse` Objekte einheitlich zu verarbeiten. Sie kümmert sich automatisch um Toast-Notifications und extrahiert die Payloads.

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
        toast.error(result.error || 'Ein Fehler ist aufgetreten.')
      }
      if (onError) onError(result.error)
      return null
    }
  } catch (error) {
    // Fängt Fehler, die direkt geworfen werden (z.B. vom globalen ErrorHandler)
    const errorMsg =
      error instanceof Error
        ? error.message
        : 'Ein unerwarteter Fehler ist aufgetreten.'
    if (showErrorToast) {
      toast.error(errorMsg)
    }
    if (onError) onError(errorMsg)
    return null
  }
}
```

**Beispielhafter Aufruf in einer React-Komponente:**

```tsx
const onSubmit = async (values: FormValues) => {
  await handleAction(updateProfileFn({ data: values }), {
    showSuccessToast: true,
    onSuccess: (data) => {
      // Formular zurücksetzen, Router refreshen etc.
    },
  })
}
```
