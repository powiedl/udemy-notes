# Datei/Verzeichnisstruktur für ein TanStack Start Fullstack Projekt

## Anforderung

Wie würdest du empfehlen, die Datei und Verzeichnisstruktur für ein TanStack Start Projekt zu organisieren. Dabei gelten folgende Voraussetzungen:

- Für das Styling soll shadcn/ui (und damit TailwindCSS, in der Version 4) verwendet werden.
- Die einzelnen Funktionen sollen mit Tests abgesichert werden. Dabei soll vitest verwendet werden.
- Als ORM soll prisma zum Einsatz kommen.
- Als Datenbank soll PostgreSQL verwendet werden.
- Für die Authentifizierung soll betterAuth verwendet werden.
- Es soll das SERVER FUNCTION SYSTEM (das in diesem Gem beschrieben ist) zum Einsatz kommen (wobei die Dateiablageorte für dich nicht "bindend" sind, sie beschreiben nur, wie es in einem konkreten Projekt ziemlich früh - ohne tiefere Kenntnis der aus der gewählten Struktur eventuell aufkommender Probleme - gewählt wurde).
- Die Datenbank soll auf Neon gehostet werden.
- Die App selbst soll auf Vercel gehostet werden.
- Es soll die Neon/Vercel Integration genutzt werden (dabei soll die Integration von Neon aus eingerichtet werden, da man hier ein großzügigeres Limit für die Anzahl der Integrationen hat wie umgekehrt).
- Als Code Repository soll Github verwendet werden.
- Es soll der Deployment Workflow, wie in den MD Files in diesem Gem beschrieben, verwendet werden (d. h. Git Branches für die Entwicklung, zum Mergen in den Main Branch soll ein Pull Request benötigt werden, der als Voraussetzungen hat, dass die Tests erfolgreich durchlaufen)

- Es soll optional möglich sein, langlaufende Tasks irgendwo außerhalb von Vercel laufen zu lassen (weil Vercel ja ein sehr enges Timeout für eine einzelne Server Function hat).

## Lösungsvorschlag

Da wir bereits sehr spezifische Anforderungen (wie das Server Function System, das typsichere URL-State-Management und Vercel als Hosting-Umgebung) haben, werde ich die Struktur genau auf diese Leitfäden und Best Practices zuschneiden.

Hier ist mein Architektur-Entwurf für das Udemy-Notes Projekt.

### Die empfohlene Verzeichnisstruktur

```text
udemy-notes/
├── .github/
│   └── workflows/
│       └── ci.yml                   # CI/CD Pipeline (führt Vitest bei PRs aus)
├── prisma/
│   ├── schema.prisma                # Datenbankmodell für PostgreSQL (Neon)
│   └── seed.ts                      # Initiales Seeding der Datenbank
├── public/                          # Statische Assets (Favicon, Logos)
├── src/
│   ├── components/
│   │   ├── ui/                      # Automatisch generierte shadcn/ui Komponenten
│   │   └── web/                     # Eigene, wiederverwendbare UI-Komponenten (z.B. data-table-pagination.tsx)
│   ├── data/                        # Domänen-Logik & Server Functions (Server Function System)
│   │   ├── course.ts                # Transport-Schicht / RPC Entrypoint (für den Client)
│   │   ├── course.logic.server.ts   # Reine Business-Logik / Prisma-Aufrufe (strikt getrennt)
│   │   ├── note.ts
│   │   └── note.logic.server.ts
│   ├── hooks/                       # Eigene React Hooks (z.B. use-mobile.ts)
│   ├── jobs/                        # (Optional) Definition von langlaufenden Tasks
│   │   └── background-tasks.ts
│   ├── lib/                         # Konfigurationen & Utilities
│   │   ├── auth.ts                  # betterAuth Server-Instanz
│   │   ├── auth-client.ts           # betterAuth Client-Instanz
│   │   ├── client-utils.ts          # Client-Helfer (z.B. handleAction Funktion)
│   │   ├── db.server.ts             # Prisma Client Initialisierung
│   │   ├── error-handler.server.ts  # Globale Fehler-Middleware
│   │   ├── logging.server.ts        # DB-Logging Logik
│   │   ├── rpc.ts                   # Fabriken für Server Functions (baseServerFn, authGetFn)
│   │   └── server-utils.server.ts   # wrapServerAction Hülle
│   ├── middlewares/
│   │   └── auth.ts                  # Middleware für den Router (Session-Checks)
│   ├── routes/                      # File-based Routing via TanStack Router
│   │   ├── __root.tsx
│   │   ├── index.tsx
│   │   ├── _content/                # Layout-Route (z.B. mit Sidebar/Navbar)
│   │   │   ├── courses/
│   │   │   │   ├── index.tsx        # Inklusive loaderDeps und useDeferredValue für Pagination
│   │   │   │   └── $courseId.tsx
│   │   │   └── route.tsx            # Layout für _content
│   │   └── api/
│   │       └── auth/
│   │           └── $.ts             # API Route für betterAuth (Catch-All)
│   ├── schemas/                     # Zod-Schemas
│   │   ├── search-params.ts         # Zentrale Search Params (PAGINATION_DEFAULTS)
│   │   └── course.ts                # Validierungsschemas (Mutations/Inputs)
│   ├── types/                       # Globale TypeScript-Typen
│   │   ├── api.ts                   # ActionResponse Typen
│   │   └── errors.ts                # ServerActionError Klasse
│   ├── app.css                      # Tailwind v4 Hauptdatei (Importiert @tailwindcss)
│   ├── entry-client.tsx             # TanStack Start Client-Hydrierung
│   ├── entry-server.tsx             # TanStack Start Server-Rendering
│   └── router.tsx                   # TanStack Router Setup
├── .env                             # Environment Variables (Neon DB URL, Vercel Auth, etc.)
├── app.config.ts                    # TanStack Start & Vite Konfiguration
├── components.json                  # shadcn/ui Konfiguration
├── package.json
└── vitest.config.ts                 # Vitest Konfiguration

```

---

### Warum dieses Design? (Die Architektur-Entscheidungen)

#### 1. Server Function System (SFS) & Dateitrennung

Der Kern dieser Struktur ist der `src/data/` (oder `src/features/`) Ordner. Gemäß deinem Leitfaden müssen wir Server-Code strikt vom Client-Bundle trennen.

- **Die `*.ts` Dateien:** Sind die RPC-Entrypoints. Sie importieren Module wie `wrapServerAction` oder die Logik **ausschließlich dynamisch im Handler**.

- **Die `*.logic.server.ts` Dateien:** Hier lebt Prisma. Das `.server.ts` Suffix garantiert, dass Vite diesen Code beim Builden für den Browser aggressiv herausschneidet (Tree-Shaking). Das verhindert, dass Node.js-Abhängigkeiten in den Browser gelangen und Abstürze verursachen.

#### 2. Fehlerbehandlung & Logging (Das Zwei-Schichten-Modell)

Die Struktur im `src/lib/` Ordner spiegelt exakt dein Sicherheitsnetz wider:

- `rpc.ts` baut die `errorHandlingMiddleware`, die auf `error-handler.server.ts` (Schicht 1) zurückgreift.

- `server-utils.server.ts` stellt `wrapServerAction` (Schicht 2) zur Verfügung, das von den Transport-Dateien in `src/data/` genutzt wird.

- Dadurch fangen wir Fehler sicher ab, maskieren sie für den Client und loggen sie über `logging.server.ts` sauber in die Neon-Datenbank.

#### 3. Styling mit Tailwind v4 & shadcn/ui

Da TailwindCSS in Version 4 verwendet wird, benötigen wir keine traditionelle `tailwind.config.js` mehr. Stattdessen konfigurieren wir das Theme direkt in der `app.css` über CSS-Variablen. shadcn/ui legt seine generierten Dateien isoliert unter `src/components/ui/` ab, was es leicht macht, sie von unserer eigenen UI-Logik (wie der `data-table-pagination.tsx`) in `src/components/web/` zu trennen.

#### 4. Die Git & Deployment Pipeline (.github/workflows)

Um deine Regel ("Mergen in den Main Branch erfordert erfolgreiche Tests") umzusetzen, haben wir den `.github/workflows/` Ordner. Hier wird eine `ci.yml` abgelegt. GitHub Actions führt bei jedem Pull Request `vitest` aus. In den Repository-Einstellungen auf GitHub definierst du dann, dass dieser Check "Required" ist, bevor der Merge-Button freigeschaltet wird.

#### 5. Langlaufende Tasks (Der `src/jobs/` Ordner)

Da Vercel strenge Timeouts für Serverless Functions hat (im Hobby-Plan z. B. 10 Sekunden, maximal 5 Minuten im Pro-Plan), ist der Ordner `src/jobs/` vorgesehen.

- **Empfehlung:** Für Vercel-Projekte eignen sich Plattformen wie **Trigger.dev** oder **Inngest**. Du schreibst die Logik für deinen langlaufenden Task in `src/jobs/` und triggerst ihn über deine Server Function (`src/data/*.ts`). Die tatsächliche Ausführung des Tasks wird dann an die Serverstruktur von Trigger.dev/Inngest ausgelagert, womit das Vercel-Timeout elegant umgangen wird, du aber den Code im selben Repository behältst.

#### 6. Verzicht auf TanStack Query

Wie von dir gefordert, ist TanStack Query hier nicht verbaut. TanStack Start mit seinem Router-Cache, den `loaderDeps` und dem `staleTime`-Handling reicht in den meisten Fällen für Datenabfragen (wie Suche und Pagination) völlig aus. Erst wenn wir komplexe, clientseitige Optimistic Updates oder sehr aggressives Polling bräuchten, würden wir das Thema neu bewerten.
