# Prisma Workflow & Migration Guide

This document describes the safe handling of Prisma and PostgreSQL in TanStack Start (or comparable) projects. It serves as a reference for local development (DEV) and deployment to production systems (PROD) to avoid data loss and schema conflicts.

---

## 1. Core Concepts: `db push` vs. `migrate`

The most important understanding in Prisma is the difference between prototyping (`push`) and versioned schema development (`migrate`).

### `prisma db push` (The Prototyping Tool)

- **What it does:** It synchronizes the current state of `schema.prisma` directly with the database. **No** migration files (`.sql`) are created. There is no history.
- **When to use:** \* At the very beginning of a project, when the data schema is still being completely overhauled on a daily basis.
    - When you want to create tables quickly and it doesn't matter if the database is deleted/reset in the process.
- **When NOT to use:** \* **Never on PROD** once the project is live.
    - No longer on DEV once you are working with real test data or developing in a team.

### `prisma migrate dev` (The Development Standard)

- **What it does:** Compares the `schema.prisma` with the database, generates a clean SQL migration file from it in the `prisma/migrations` folder, saves it, and then executes it in the database. Prisma remembers which scripts have already been executed in the `_prisma_migrations` table.
- **When to use:** Whenever you change the schema on DEV (add/delete columns, adjust relations).
- **When NOT to use:** **Never on PROD!** If Prisma detects a conflict ("drift") here, it will offer to completely delete (reset) the database.

### `prisma migrate deploy` (The Production Standard)

- **What it does:** It generates **nothing new**. It simply looks in the `prisma/migrations` folder, compares it with the `_prisma_migrations` table of the target database, and only executes the `.sql` scripts that are missing there.
- **When to use:** Exclusively for PROD (or staging environments). This is the safe way to take changes from DEV live.

---

## 2. The NPM Scripts (Correction & Standard)

Copy these scripts exactly like this into new projects (there is intentionally neither `prod:db:push` nor `prod:db:migrate` - these two operations have no place in PROD, as they can potentially lead to (complete) data loss):

```json
"scripts": {
  "// --- DEVELOPMENT (Local Database) ---": "",
  "db:generate": "dotenv -e .env.development.local -- prisma generate",
  "db:push": "dotenv -e .env.development.local -- prisma db push",
  "db:push:force": "dotenv -e .env.development.local -- prisma db push --force-reset",
  "db:migrate": "dotenv -e .env.development.local -- prisma migrate dev",
  "db:studio": "dotenv -e .env.development.local -- prisma studio",
  "db:seed": "dotenv -e .env.development.local -- prisma db seed",

  "// --- PRODUCTION (Live Database) ---": "",
  "prod:db:generate": "dotenv -e .env.production.local -- prisma generate",
  "prod:db:deploy": "dotenv -e .env.production.local -- prisma migrate deploy",
  "prod:db:studio": "dotenv -e .env.production.local -- prisma studio",
  "prod:db:seed": "dotenv -e .env.production.local -- prisma db seed"
}
```

_(Note: `prod:db:push` and `prod:db:migrate dev` were intentionally removed to prevent accidental data loss on PROD.)_

---

## 3. The Standard Workflow: Rolling out changes safely

If you make a simple change to the schema (e.g., add a new column), always follow this pattern:

1. **Adjust Schema:** Change the `schema.prisma`.
2. **Migrate DEV:** Execute `npm run db:migrate`. (Prisma will ask for a name for the migration, e.g., `add_user_age`).
3. **Adjust Code:** Rewrite your TypeScript so that it uses the new database structure.
4. **Git Commit:** Commit your code including the new folder in `prisma/migrations/`.
5. **Update PROD:** Execute `npm run prod:db:deploy` on PROD (or via CI/CD).

---

## 4. The "Open Heart Surgery" Workflow (Complex Migrations)

If you have to change structure **and** data at the same time (e.g., when a simple string field becomes a relational table), you must not delete the old field immediately.

**The safe 3-phase plan:**

### Phase 1: Create New Structure

1. Add the new models/tables in `schema.prisma`, but **keep the old column**.
2. Execute `npm run db:migrate` (Name: `add_new_tables`).
3. Execute `npm run prod:db:deploy` so that PROD also has the new tables.

### Phase 2: Transfer Data (Data Migration)

1. Write a script (e.g., via `seed` or a custom script in `scripts/`) that copies and processes the data from the old column into the new tables.
2. Execute the script on DEV.
3. Execute the script on PROD.
4. (Optional) Use `npm run db:studio` / `npm run prod:db:studio` to check if the data has safely arrived in the new table.

### Phase 3: Delete Old Structure

1. Now delete the old column from `schema.prisma`.
2. Execute `npm run db:migrate` (Name: `drop_old_column`). Prisma deletes the column on DEV.
3. Adjust your remaining TypeScript code to the new structure.
4. Execute `npm run prod:db:deploy`. Prisma safely deletes the column on PROD.

---

## 5. Setting up a new project (From Zero to PROD)

If you are starting a completely new TanStack Start project with Prisma, follow these steps to have a clean history right from the start.

### Step 1: Initialization

Install Prisma and initialize it:

```bash
npm install prisma --save-dev
npm install @prisma/client
npx prisma init
```

### Step 2: Design the first schema

Define your models in `schema.prisma`. Make sure your local `.env` files point correctly to the DEV database.

### Step 3: Create the Baseline (First Migration)

Instead of using `db push`, directly create the initial migration. This is the foundation of the database:

```bash
npm run db:migrate
# Prisma will ask for a name. Call it e.g., "init".
```

_Prisma now creates the tables on DEV and creates the folder `prisma/migrations/XXXXXXXXXXXXXX_init`._

### Step 4: Initialize PROD

When you are ready to mirror your database to PROD for the first time:

1. Ensure that your `.env.production.local` contains the correct PROD database URL.
2. Execute the deployment script:

```bash
npm run prod:db:deploy
```

_Since the PROD database is still empty, Prisma executes the `init` migration from Step 3 on PROD and cleanly creates all tables._

From this point on, DEV and PROD are perfectly synchronized and share the same migration history. For all future changes, the "Standard Workflow" from Chapter 3 applies again.
