# Prisma Workflow & Migrations-Leitfaden

Dieses Dokument beschreibt den sicheren Umgang mit Prisma und PostgreSQL in TanStack Start (oder vergleichbaren) Projekten. Es dient als Referenz für die lokale Entwicklung (DEV) und das Deployment auf produktive Systeme (PROD), um Datenverlust und Schema-Konflikte zu vermeiden.

---

## 1. Kernkonzepte: `db push` vs. `migrate`

Das wichtigste Verständnis bei Prisma ist der Unterschied zwischen Prototyping (`push`) und versionierter Schema-Entwicklung (`migrate`).

### `prisma db push` (Das Prototyping-Tool)

- **Was es tut:** Es synchronisiert den aktuellen Stand der `schema.prisma` direkt mit der Datenbank. Es werden **keine** Migrations-Dateien (`.sql`) erstellt. Es gibt keine Historie.
- **Wann verwenden:** \* Ganz am Anfang eines Projekts, wenn man das Datenschema noch täglich komplett über den Haufen wirft.
  - Wenn man schnell Tabellen erstellen will und es egal ist, ob die Datenbank dabei gelöscht/resettet wird.
- **Wann NICHT verwenden:** \* **Niemals auf PROD**, sobald das Projekt live ist.
  - Nicht mehr auf DEV, sobald man mit echten Testdaten arbeitet oder im Team entwickelt.

### `prisma migrate dev` (Der Entwicklungs-Standard)

- **Was es tut:** Vergleicht die `schema.prisma` mit der Datenbank, generiert daraus eine saubere SQL-Migrations-Datei im Ordner `prisma/migrations`, speichert diese ab und führt sie dann in der Datenbank aus. Prisma merkt sich in der Tabelle `_prisma_migrations`, welche Skripte bereits ausgeführt wurden.
- **Wann verwenden:** Immer, wenn man auf DEV das Schema ändert (Spalten hinzufügen, löschen, Relationen anpassen).
- **Wann NICHT verwenden:** **Niemals auf PROD!** Wenn Prisma hier einen Konflikt ("Drift") feststellt, bietet es an, die Datenbank komplett zu löschen (Reset).

### `prisma migrate deploy` (Der Produktions-Standard)

- **Was es tut:** Es generiert **nichts neu**. Es schaut lediglich in den Ordner `prisma/migrations`, vergleicht ihn mit der `_prisma_migrations` Tabelle der Zieldatenbank und führt nur die `.sql` Skripte aus, die dort noch fehlen.
- **Wann verwenden:** Ausschließlich für PROD (oder Staging-Umgebungen). Dies ist der sichere Weg, um Änderungen aus DEV live zu schalten.

---

## 2. Die NPM Scripts (Korrektur & Standard)

Übernimm diese Scripts exakt so in neue Projekte (es gibt mit Absicht weder prod:db:push noch prod:db:migrate - diese beiden Operationen haben in PROD nichts verloren, da sie potenziell zu (komplettem) Datenverlust führen können):

```json
"scripts": {
  "// --- DEVELOPMENT (Lokale Datenbank) ---": "",
  "db:generate": "dotenv -e .env.development.local -- prisma generate",
  "db:push": "dotenv -e .env.development.local -- prisma db push",
  "db:push:force": "dotenv -e .env.development.local -- prisma db push --force-reset",
  "db:migrate": "dotenv -e .env.development.local -- prisma migrate dev",
  "db:studio": "dotenv -e .env.development.local -- prisma studio",
  "db:seed": "dotenv -e .env.development.local -- prisma db seed",

  "// --- PRODUCTION (Live Datenbank) ---": "",
  "prod:db:generate": "dotenv -e .env.production.local -- prisma generate",
  "prod:db:deploy": "dotenv -e .env.production.local -- prisma migrate deploy",
  "prod:db:studio": "dotenv -e .env.production.local -- prisma studio",
  "prod:db:seed": "dotenv -e .env.production.local -- prisma db seed"
}
```

_(Hinweis: `prod:db:push` und `prod:db:migrate dev` wurden absichtlich entfernt, um versehentlichen Datenverlust auf PROD zu verhindern.)_

---

## 3. Der Standard-Workflow: Änderungen sicher ausrollen

Wenn du eine einfache Änderung am Schema vornimmst (z.B. eine neue Spalte hinzufügst), folge immer diesem Muster:

1. **Schema anpassen:** Ändere die `schema.prisma`.
2. **DEV migrieren:** Führe `npm run db:migrate` aus. (Prisma fragt nach einem Namen für die Migration, z.B. `add_user_age`).
3. **Code anpassen:** Schreibe dein TypeScript so um, dass es die neue Datenbankstruktur nutzt.
4. **Git Commit:** Committe deinen Code inklusive des neuen Ordners in `prisma/migrations/`.
5. **PROD aktualisieren:** Führe auf PROD (oder via CI/CD) `npm run prod:db:deploy` aus.

---

## 4. Der "Operation am offenen Herzen" Workflow (Komplexe Migrationen)

Wenn du Struktur **und** Daten gleichzeitig ändern musst (z.B. wenn aus einem einfachen String-Feld eine relationale Tabelle wird), darfst du das alte Feld nicht sofort löschen.

**Der sichere 3-Phasen-Plan:**

### Phase 1: Neue Struktur anlegen

1. Ergänze die neuen Modelle/Tabellen in der `schema.prisma`, aber **behalte die alte Spalte bei**.
2. Führe `npm run db:migrate` (Name: `add_new_tables`) aus.
3. Führe `npm run prod:db:deploy` aus, damit auch PROD die neuen Tabellen hat.

### Phase 2: Daten umfüllen (Data Migration)

1. Schreibe ein Skript (z.B. via `seed` oder ein custom Skript in `scripts/`), das die Daten aus der alten Spalte in die neuen Tabellen kopiert und aufbereitet.
2. Führe das Skript auf DEV aus.
3. Führe das Skript auf PROD aus.
4. (Optional) Nutze `db:studio` / `prod:db:studio`, um zu prüfen, ob die Daten sicher in der neuen Tabelle angekommen sind.

### Phase 3: Alte Struktur löschen

1. Lösche jetzt die alte Spalte aus der `schema.prisma`.
2. Führe `npm run db:migrate` (Name: `drop_old_column`) aus. Prisma löscht die Spalte auf DEV.
3. Passe deinen restlichen TypeScript-Code an die neue Struktur an.
4. Führe `npm run prod:db:deploy` aus. Prisma löscht die Spalte auf PROD sicher.

---

## 5. Ein neues Projekt aufsetzen (Von Null auf PROD)

Wenn du ein komplett neues TanStack Start Projekt mit Prisma startest, befolge diese Schritte, um von Anfang an eine saubere Historie zu haben.

### Schritt 1: Initialisierung

Installiere Prisma und initialisiere es:

```bash
npm install prisma --save-dev
npm install @prisma/client
npx prisma init
```

### Schritt 2: Das erste Schema entwerfen

Definiere deine Modelle in der `schema.prisma`. Stelle sicher, dass deine lokalen `.env` Dateien korrekt auf die DEV-Datenbank zeigen.

### Schritt 3: Die Baseline (Erste Migration) erstellen

Statt `db push` zu nutzen, erstelle direkt die initiale Migration. Das ist das Fundament der Datenbank:

```bash
npm run db:migrate
# Prisma wird nach einem Namen fragen. Nenne es z.B. "init".
```

_Prisma legt nun die Tabellen auf DEV an und erstellt den Ordner `prisma/migrations/XXXXXXXXXXXXXX_init`._

### Schritt 4: PROD initialisieren

Wenn du bereit bist, deine Datenbank zum ersten Mal auf PROD zu spiegeln:

1. Stelle sicher, dass deine `.env.production.local` die richtige PROD-Datenbank-URL enthält.
2. Führe das Deployment-Skript aus:

```bash
npm run prod:db:deploy
```

_Da die PROD-Datenbank noch leer ist, führt Prisma die `init`-Migration von Schritt 3 auf PROD aus und legt alle Tabellen sauber an._

Ab diesem Zeitpunkt sind DEV und PROD perfekt synchronisiert und teilen sich dieselbe Migrations-Historie. Für alle zukünftigen Änderungen greift wieder der "Standard-Workflow" aus Kapitel 3.
