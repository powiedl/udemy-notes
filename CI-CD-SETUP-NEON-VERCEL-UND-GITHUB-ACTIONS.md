# Dokumentation: Fullstack CI/CD Setup mit Neon, Vercel & GitHub Actions

Diese Dokumentation beschreibt ein modernes, professionelles Continuous Integration und Continuous Deployment (CI/CD) Setup für eine Fullstack-Anwendung (Next.js/TanStack Start, Prisma v7+, Tailwind). Es nutzt das Konzept des **Database Branchings** sowie automatisierte Tests, um Feature-Branches isoliert und sicher zu testen. Nach erfolgreichem Testen und Mergen reinigt sich das System automatisch selbst.

---

## Teil 1: Architektur & Funktionsweise (Konzepte)

Dieses Setup besteht aus fünf ineinandergreifenden Systemen, die automatisiert zusammenarbeiten, sobald ein Pull Request (PR) auf GitHub erstellt oder geschlossen wird.

### 1. Database Branching (Neon & Vercel)

In traditionellen Setups teilen sich alle Entwicklungsstände eine DEV- und eine PROD-Datenbank. Mit Neon Serverless Postgres wird die Datenbank bei jedem GitHub Pull Request geklont.

- **Warum notwendig?** Wenn Vercel ein Preview-Deployment für einen Feature-Branch erstellt und dabei Datenbank-Migrationen (`prisma migrate deploy`) ausführt, würden diese Schema-Änderungen die reguläre Entwicklungs- oder Produktionsdatenbank beschädigen.
- **Was es bewirkt:** Die Neon-Integration fängt das Vercel-Preview-Event ab, erstellt in Sekundenbruchteilen einen neuen Branch (Kopie) der PROD-Datenbank und übergibt die temporären Zugangsdaten an Vercel. Jeder PR bekommt somit eine völlig isolierte Datenbank-Umgebung.

### 2. Prisma 7 Konfiguration (Pooled vs. Direct Connection)

Serverless-Umgebungen (wie Vercel) öffnen für jeden Request kurzzeitig eigene Server-Instanzen. Das würde klassische Datenbanken durch zu viele parallele Verbindungen überlasten. Neon nutzt deshalb einen "Pooler" (Türsteher), der Verbindungen bündelt.

- **Warum notwendig?** Die Prisma CLI benötigt für Strukturänderungen (Migrationen) zwingend eine direkte, ungeschützte Leitung (`DATABASE_URL_UNPOOLED`), während die laufende App zum Schutz der Datenbank den Pooler (`DATABASE_URL`) verwenden muss. Prisma 7 erzwingt diese architektonische Trennung explizit.
- **Was es bewirkt:** Das `schema.prisma` wird von URLs befreit. Die CLI holt sich die direkte Leitung aus der `prisma.config.ts`, während der Laufzeit-Code (App) über den `@prisma/adapter-pg` den gebündelten Pooler nutzt.

### 3. Dynamische Authentifizierung (BetterAuth)

Authentifizierungs-Cookies sind streng an Domains gebunden.

- **Warum notwendig?** Vercel generiert für jeden Feature-Branch (Preview) eine neue, zufällige URL. Wenn BetterAuth fest auf eine statische Domain konfiguriert ist, schlägt der Login in Preview-Umgebungen fehl.
- **Was es bewirkt:** Durch eine Hilfsfunktion auf dem Server wird geprüft, ob sich der Code in einer Vercel-Preview-Umgebung befindet. Ist dies der Fall, zieht sich BetterAuth automatisch die dynamisch generierte URL (`VERCEL_URL`). Der Client wird von statischen URLs befreit und liest seine Umgebung (`window.location.origin`) selbst aus dem Browser aus.

### 4. Automatisierte Tests (GitHub Actions)

Bevor Code in den Master gemergt werden darf, muss seine Integrität sichergestellt sein.

- **Warum notwendig?** Manuelle Tests werden oft vergessen. Ein defekter Feature-Branch könnte den Master "brechen".
- **Was es bewirkt:** Ein GitHub Actions Workflow startet bei jedem Pull Request einen virtuellen Linux-Server, installiert die Abhängigkeiten und führt die Tests aus (`pnpm test`). Da die Tests gemockt (simuliert) sind, benötigen sie keine echte Datenbankverbindung. Eine fingierte `.env.test` Datei verhindert zudem sicher, dass Tests versehentlich mit echten Datenbanken interagieren. Schlägt ein Test fehl, blockiert GitHub den Merge-Vorgang ("Branch Protection").

### 5. Automatisches Aufräumen (Neon Branch Cleanup)

Vercel-Deployments sind temporär, aber die dazugehörigen Neon-Branches können als verwaiste Kopien bestehen bleiben und Account-Limits belasten.

- **Warum notwendig?** Ein manuelles Löschen der Datenbank-Branches nach jedem PR ist fehleranfällig und aufwendig.
- **Was es bewirkt:** Ein zweiter GitHub Actions Workflow wartet auf das Schließen (Mergen) eines Pull Requests. Er greift über die Neon API auf das Projekt zu und löscht gezielt den spezifischen Datenbank-Branch (`preview/<branch-name>`), der für diese Vorschau generiert wurde. Das System hält sich dadurch vollkommen selbstständig sauber.

---

## Teil 2: Schritt-für-Schritt Anleitung zur Einrichtung

### 1. Neon & Vercel verknüpfen

1. Im Neon Dashboard in das **Produktions-Projekt** wechseln.
2. Im Menü auf **Integrations** klicken.
3. Die Vercel-Integration auswählen und autorisieren.
4. Das Neon PROD-Projekt mit dem entsprechenden Vercel-Projekt verknüpfen.

### 2. Umgebungsvariablen in Vercel anpassen

1. Im Vercel Dashboard unter **Settings -> Environment Variables** prüfen, ob Neon die Variablen `DATABASE_URL` und `DATABASE_URL_UNPOOLED` angelegt hat.
2. Gegebenenfalls alte, manuelle Datenbank-Variablen löschen.
3. Die Variable `BETTER_AUTH_URL` bearbeiten: Den Wert auf die echte Live-URL (z.B. `https://meine-app.vercel.app`) belassen, aber in den Checkboxen **nur Production** anhaken (Preview und Development deaktivieren).
4. Variablen mit dem Präfix `VITE_BETTER_AUTH_URL` restlos löschen.

### 3. Prisma 7 konfigurieren

1. Die Datei `schema.prisma` anpassen (URLs entfernen):
   ```prisma
   datasource db {
     provider = "postgresql"
   }
   ```
2. Im Hauptverzeichnis die Datei `prisma.config.ts` erstellen:

   ```typescript
   import 'dotenv/config'
   import { defineConfig, env } from 'prisma/config'

   export default defineConfig({
     datasource: {
       url: env('DATABASE_URL_UNPOOLED'),
     },
   })
   ```

3. Den PrismaClient in der App (`lib/db.ts` o.ä.) mit dem `pg`-Adapter initialisieren:

   ```typescript
   import { Pool } from 'pg'
   import { PrismaPg } from '@prisma/adapter-pg'
   import { PrismaClient } from '@prisma/client'

   const connectionString = process.env.DATABASE_URL
   if (!connectionString && process.env.NODE_ENV !== 'test') {
     throw new Error('KRITISCHER FEHLER: DATABASE_URL fehlt!')
   }

   const pool = new Pool({ connectionString })
   const adapter = new PrismaPg({ pool })
   export const prisma = new PrismaClient({ adapter })
   ```

### 4. Better Auth konfigurieren

1. In der Server-Konfiguration (`auth.ts`) die URL dynamisch abfangen:

   ```typescript
   const getBaseUrl = () => {
     if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL) {
       return `https://${process.env.VERCEL_URL}`
     }
     return process.env.BETTER_AUTH_URL || 'http://localhost:3000'
   }

   export const auth = betterAuth({
     baseURL: getBaseUrl(),
     // ... restliche Konfiguration
   })
   ```

2. In der Client-Konfiguration (`auth-client.ts`) explizite URLs entfernen:

   ```typescript
   import { createAuthClient } from 'better-auth/react'

   export const authClient = createAuthClient({
     // baseURL wird weggelassen (automatische Erkennung)
   })
   ```

### 5. Test-Setup & Dummy-Env

1. Im Hauptverzeichnis eine Datei `.env.test` erstellen und mit Dummy-Daten füllen:
   ```env
   DATABASE_URL="postgresql://fake:fake@localhost:5432/fake"
   DATABASE_URL_UNPOOLED="postgresql://fake:fake@localhost:5432/fake"
   ```
2. Diese Datei in das Git-Repository committen.

### 6. Neon API Credentials für GitHub vorbereiten

1. Im Neon Dashboard die **Project ID** aus den Settings kopieren (Format: `bold-fog-...`).
2. Unter **Account Settings -> API Keys** einen neuen Key erstellen und kopieren.
3. Im GitHub Repository unter **Settings -> Secrets and variables -> Actions** eintragen:
   - Bei **Repository secrets**: Neues Secret `NEON_API_KEY` mit dem kopierten API Key erstellen.
   - Bei **Repository variables**: Neue Variable `NEON_PROJECT_ID` mit der kopierten Project ID erstellen.

### 7. GitHub Actions Workflow Dateien anlegen (CI & Cleanup)

1. Im lokalen Projekt den Pfad `.github/workflows/` erstellen.
2. Darin die Datei `test.yml` anlegen:

   ```yaml
   name: PR Tests

   on:
     pull_request:
       branches: ['master']

   jobs:
     test:
       name: Run Unit/Integration Tests
       runs-on: ubuntu-latest

       steps:
         - name: Checkout Code
           uses: actions/checkout@v4

         - name: Setup pnpm
           uses: pnpm/action-setup@v4
           with:
             version: 10

         - name: Setup Node.js
           uses: actions/setup-node@v4
           with:
             node-version: '24'
             cache: 'pnpm'

         - name: Install Dependencies
           run: pnpm install --frozen-lockfile

         - name: Run Tests
           run: pnpm run test
   ```

3. Im selben Ordner die Datei `delete-neon-branch.yml` anlegen:

   ```yaml
   name: Delete Neon Branch

   on:
     pull_request:
       types: [closed]

   jobs:
     delete-branch:
       name: Cleanup Neon Preview Branch
       runs-on: ubuntu-latest
       steps:
         - name: Delete Branch in Neon
           uses: neondatabase/delete-branch-action@v3
           with:
             project_id: ${{ vars.NEON_PROJECT_ID }}
             branch: preview/${{ github.head_ref }}
             api_key: ${{ secrets.NEON_API_KEY }}
   ```

### 8. Initiale Ausführung auf GitHub (Vorbereitung für Branch Protection)

1. Lokal einen neuen Branch erstellen: `git checkout -b setup-ci`
2. Die neu erstellten Workflow-Dateien committen: `git add .` gefolgt von `git commit -m "ci: setup workflows"`
3. Branch pushen: `git push origin setup-ci`
4. Auf GitHub gehen und einen **Pull Request** von `setup-ci` in `master` öffnen.
5. Warten, bis der Check `Run Unit/Integration Tests` in der PR-Ansicht durchgelaufen ist (gelbes Symbol wird zu grünem Haken).

### 9. Branch Protection auf GitHub aktivieren

1. Auf GitHub unter **Settings -> Branches** eine neue "Branch protection rule" hinzufügen (oder die bestehende für `master` bearbeiten).
2. Branch name pattern: `master`
3. Haken setzen bei: **Require status checks to pass before merging**.
4. Im Suchfeld nach `Run Unit/Integration Tests` suchen und den Job auswählen.
5. Speichern.
6. Den PR aus Schritt 8 mit "Squash and merge" abschließen. (Dies triggert nun auch erstmals das automatische Löschen des Neon-Branches).
7. Lokal aufräumen: `git checkout master`, `git pull origin master`, `git branch -D setup-ci`.

### 10. Der Daily Workflow (Zusammenfassung)

1. **Lokal entwickeln:** `git checkout -b mein-feature` (Arbeiten mit lokaler `.env.development` und DEV-Datenbank).
2. **Pushen:** `git push origin mein-feature`
3. **Pull Request:** PR auf GitHub öffnen.
4. **Automatisierung Start:** GitHub Actions führt Tests aus. Vercel & Neon stellen Preview-Umgebung bereit.
5. **Review:** Vercel Preview URL testen.
6. **Merge:** Auf GitHub "Squash and merge" klicken (löst Vercel Prod-Deployment aus).
7. **Automatisierung Ende:** GitHub Action löscht den temporären Neon-Branch automatisch.
8. **Aufräumen:** Lokal auf `master` wechseln, `git pull` ausführen und `git branch -D mein-feature` nutzen, um den lokalen Branch zu entfernen.
