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

Hier ist mein Vorschlag für das optimale Layout:

## 📂 Empfohlene Projektstruktur

```text
/
├── .github/workflows/          # CI/CD (Vitest, Linting, Vercel Deployment)
├── prisma/                     # Prisma Schema & Migrationen
│   ├── schema.prisma           # Definition der DB-Modelle (Neon/PostgreSQL)
│   └── seed.ts                 # Seeding-Logik für die Entwicklung[cite: 1]
├── public/                     # Statische Assets (Favicon, Logos)
├── src/
│   ├── components/             # UI-Komponenten
│   │   ├── ui/                 # Shadcn/ui Komponenten (Tailwind v4)[cite: 1]
│   │   └── web/                # Projekt-spezifische Features (z.B. Note-Card)[cite: 4]
│   ├── data/                   # SERVER FUNCTION SYSTEM (SFS)[cite: 1]
│   │   ├── [feature]/          # Gruppierung nach Feature (z.B. "course")
│   │   │   ├── course.ts       # Transport: Definition der Server Functions (RPC)
│   │   │   ├── course.logic.server.ts # Logik: Reine Server-Logik (Prisma)
│   │   │   └── course.test.ts  # Vitest: Unit-Tests für die Business-Logik
│   ├── hooks/                  # Custom React Hooks
│   ├── lib/                    # Core-Infrastruktur
│   │   ├── db.server.ts        # Prisma Client Instanz (Singleton)
│   │   ├── rpc.ts              # SFS Fabriken (authGetFn, authPostFn)
│   │   ├── utils.ts            # Shadcn/ui Helper (cn)
│   │   └── error-handler.server.ts # Globales Error-Handling (Schicht 1)
│   ├── routes/                 # TanStack Router (File-based Routing)[cite: 3, 4]
│   │   ├── __root.tsx          # Root-Layout & TanStack Query Setup
│   │   └── index.tsx           # Dashboard / Landing Page
│   ├── schemas/                # Shared Zod-Schemas (Search Params, Forms)[cite: 4]
│   ├── styles/                 # TailwindCSS v4 Entry Point
│   │   └── globals.css         # @theme Variablen & Imports
│   ├── types/                  # Globale TypeScript Interfaces & SFS-Typen
│   ├── worker/                 # OPTIONAL: Langläufer-Logik
│   │   └── heavy-tasks.ts      # Logik für externe Trigger (z.B. Inngest/Hetzner)
│   ├── app.config.ts           # TanStack Start / Vite Konfiguration[cite: 3]
│   ├── entry-client.tsx        # Hydrierung im Browser[cite: 3]
│   └── entry-server.tsx        # SSR Rendering[cite: 3]
├── vitest.config.ts            # Test-Konfiguration
└── package.json

```

---

## 🛠 Warum dieses Design?

### 1. Das SFS-Duo (`.ts` vs. `.logic.server.ts`)

Um den "Leak" von Server-Code in das Client-Bundle zu verhindern, trennen wir jede Server Function:

- **`course.ts`**: Hier definierst du nur die `createServerFn`. Sie importiert die Logik-Datei nur **dynamisch** innerhalb des Handlers. Das hält dein Client-Bundle extrem klein.
- **`course.logic.server.ts`**: Hier liegt das "Skalpell". Sie hat vollen Zugriff auf Prisma und Node-Module. Da sie auf `.server.ts` endet, wird sie vom Vite-Bundler für den Client komplett ignoriert.

### 2. Testing mit Vitest

Tests liegen direkt bei der Logik im `data/`-Verzeichnis. Das fördert die Wartbarkeit. Da wir die Business-Logik in den `*.logic.server.ts` Dateien von der TanStack-Infrastruktur entkoppeln, kannst du diese Funktionen in Vitest als reine "Pure Functions" testen, ohne den gesamten Server zu simulieren.

### 3. State in der URL & Schemas

Wir nutzen einen zentralen `schemas/`-Ordner für `search-params.ts`. Dies ist die "Source of Truth" für deine Suche und Pagination. Da sowohl die Route (`validateSearch`) als auch die Server Function (`validator`) darauf zugreifen, hast du eine Ende-zu-Ende Typsicherheit.

### 4. Langlaufende Tasks (Vercel Timeout)

Vercel hat ein Limit (oft 10-60s). Für Aufgaben wie "Udemy HTML-Parsing von 100 Kursen" ist das zu wenig.

- **Empfehlung:** Nutze die `worker/` Struktur, um dort Logik zu definieren, die über einen Webhook getriggert wird. Du kannst diesen Code auf Vercel deployen (für kurze Tasks) oder dieselbe Logik auf einer kleinen Instanz (z.B. Hetzner/Railway) via Docker laufen lassen, falls die Timeouts zuschlagen.

### 5. Neon & Vercel Workflow

Die Integration sorgt dafür, dass deine `DATABASE_URL` automatisch in den Vercel Environment Variables landet. Durch die Nutzung von **Feature Branches** und **Pull Requests** in GitHub stellst du sicher, dass Prisma-Migrationen erst getestet werden, bevor sie den `main`-Branch und damit die Produktions-DB erreichen.

---

## 💡 Nächste Schritte

Dieses Layout ist bereit für den Einsatz. Benötigst du für einen der Bereiche (z.B. die konkrete Vitest-Konfiguration für Prisma oder die Anbindung der externen Worker) spezifische Prompts für den **Gemini Code Assist**?

Ansonsten wäre meine Frage an dich:
Soll ich dir zeigen, wie du die `app.config.ts` für Tailwind v4 und Vitest spezifisch konfigurierst, um dieses Verzeichnis-Layout optimal zu unterstützen?
