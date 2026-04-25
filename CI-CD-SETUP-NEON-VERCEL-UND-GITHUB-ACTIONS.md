# Dokumentation: Fullstack CI/CD Setup mit Neon, Vercel & GitHub Actions

Diese Dokumentation beschreibt ein modernes, professionelles Continuous Integration und Continuous Deployment (CI/CD) Setup für eine Fullstack-Anwendung (Next.js/TanStack Start, Prisma v7+, Tailwind). Es nutzt das Konzept des **Database Branchings** sowie automatisierte Tests, um Feature-Branches isoliert und sicher zu testen, bevor sie in das Produktionssystem (Master-Branch) überführt werden.

---

## Teil 1: Architektur & Funktionsweise (Konzepte)

Dieses Setup besteht aus vier ineinandergreifenden Systemen, die automatisiert zusammenarbeiten, sobald ein Pull Request (PR) auf GitHub erstellt wird.

### 1. Database Branching (Neon & Vercel)

In traditionellen Setups teilen sich alle Entwicklungsstände eine DEV- und eine PROD-Datenbank. Mit Neon Serverless Postgres wird die Datenbank bei jedem GitHub Pull Request geklont.

- **Warum notwendig?** Wenn Vercel ein Preview-Deployment für einen Feature-Branch erstellt und dabei Datenbank-Migrationen (`prisma migrate deploy`) ausführt, würden diese Schema-Änderungen die reguläre Entwicklungs- oder Produktionsdatenbank beschädigen.
- **Was es bewirkt:** Die Neon-Integration fängt das Vercel-Preview-Event ab, erstellt in Sekundenbruchteilen einen neuen Branch (Kopie) der PROD-Datenbank und übergibt die temporären Zugangsdaten an Vercel. Jeder PR bekommt somit eine völlig isolierte Datenbank-Umgebung, die nach dem Mergen automatisch gelöscht wird.

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

---

## Teil 2: Schritt-für-Schritt Anleitung zur Einrichtung

Diese Anleitung beschreibt rein die auszuführenden Schritte zur Einrichtung des Setups.

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
