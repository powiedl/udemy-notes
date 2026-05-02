# Documentation: Fullstack CI/CD Setup with Neon, Vercel & GitHub Actions

This documentation describes a modern, professional Continuous Integration and Continuous Deployment (CI/CD) setup for a fullstack application (Next.js/TanStack Start, Prisma v7+, Tailwind). It utilizes the concept of **Database Branching** as well as automated tests to test feature branches in isolation and security. After successful testing and merging, the system automatically cleans itself up.

---

## Part 1: Architecture & Functionality (Concepts)

This setup consists of five interlocking systems that work together automatically as soon as a Pull Request (PR) is created or closed on GitHub.

### 1. Database Branching (Neon & Vercel)

In traditional setups, all development stages share a single DEV and PROD database. With Neon Serverless Postgres, the database is cloned for every GitHub Pull Request.

- **Why is it necessary?** If Vercel creates a preview deployment for a feature branch and executes database migrations (`prisma migrate deploy`), these schema changes would damage the regular development or production database.
- **What it does:** The Neon integration intercepts the Vercel preview event, creates a new branch (copy) of the PROD database in a fraction of a second, and passes the temporary credentials to Vercel. Every PR thus receives a completely isolated database environment.

### 2. Prisma 7 Configuration (Pooled vs. Direct Connection)

Serverless environments (like Vercel) briefly open their own server instances for each request. This would overload traditional databases with too many parallel connections. Therefore, Neon uses a "pooler" (proxy) that bundles connections.

- **Why is it necessary?** The Prisma CLI strictly requires a direct, unprotected line (`DATABASE_URL_UNPOOLED`) for structural changes (migrations), while the running app must use the pooler (`DATABASE_URL`) to protect the database. Prisma 7 explicitly enforces this architectural separation.
- **What it does:** The `schema.prisma` file is stripped of URLs. The CLI retrieves the direct connection from `prisma.config.ts`, while the runtime code (the app) uses the bundled pooler via the `@prisma/adapter-pg`.

### 3. Dynamic Authentication (BetterAuth)

Authentication cookies are strictly tied to domains.

- **Why is it necessary?** Vercel generates a new, random URL for each feature branch (preview). If BetterAuth is hard-coded to a static domain, logins in preview environments will fail.
- **What it does:** A helper function on the server checks whether the code is running in a Vercel preview environment. If so, BetterAuth automatically grabs the dynamically generated URL (`VERCEL_URL`). The client is freed from static URLs and reads its environment (`window.location.origin`) directly from the browser.

### 4. Automated Tests (GitHub Actions)

Before code can be merged into the master branch, its integrity must be ensured.

- **Why is it necessary?** Manual tests are often forgotten. A broken feature branch could "break" the master branch.
- **What it does:** A GitHub Actions workflow spins up a virtual Linux server for every pull request, installs dependencies, and runs the tests (`pnpm test`). Since the tests are mocked (simulated), they do not require a real database connection. Additionally, a fake `.env.test` file reliably prevents tests from accidentally interacting with real databases. If a test fails, GitHub blocks the merge process ("Branch Protection").

### 5. Automatic Cleanup (Neon Branch Cleanup)

Vercel preview deployments are temporary, but the corresponding Neon branches can remain as orphaned copies and consume account limits.

- **Why is it necessary?** Manually deleting database branches after every PR is error-prone and tedious.
- **What it does:** A second GitHub Actions workflow waits for a pull request to be closed (merged). It accesses the project via the Neon API and specifically deletes the database branch (`preview/<branch-name>`) that was generated for this preview. As a result, the system keeps itself completely clean automatically.

---

## Part 2: Step-by-Step Setup Guide

### 1. Link Neon & Vercel

1. Switch to the **Production Project** in the Neon Dashboard.
2. Click on **Integrations** in the menu.
3. Select the Vercel integration and authorize it.
4. Link the Neon PROD project with the corresponding Vercel project.

### 2. Adjust Environment Variables in Vercel

1. In the Vercel Dashboard under **Settings -> Environment Variables**, check if Neon has created the variables `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
2. Delete any old, manual database variables if necessary.
3. Edit the `BETTER_AUTH_URL` variable: Keep the value as your real live URL (e.g., `https://my-app.vercel.app`), but in the checkboxes, select **Production only** (deactivate Preview and Development).
4. Completely delete any variables with the prefix `VITE_BETTER_AUTH_URL`.

### 3. Configure Prisma 7

1. Adjust the `schema.prisma` file (remove URLs):
   ```prisma
   datasource db {
     provider = "postgresql"
   }
   ```
2. Create the `prisma.config.ts` file in the root directory:

   ```typescript
   import 'dotenv/config'
   import { defineConfig, env } from 'prisma/config'

   export default defineConfig({
     datasource: {
       url: env('DATABASE_URL_UNPOOLED'),
     },
   })
   ```

3. Initialize the PrismaClient in the app (e.g., `lib/db.ts`) with the `pg` adapter:

   ```typescript
   import { Pool } from 'pg'
   import { PrismaPg } from '@prisma/adapter-pg'
   import { PrismaClient } from '@prisma/client'

   const connectionString = process.env.DATABASE_URL
   if (!connectionString && process.env.NODE_ENV !== 'test') {
     throw new Error('CRITICAL ERROR: DATABASE_URL is missing!')
   }

   const pool = new Pool({ connectionString })
   const adapter = new PrismaPg({ pool })
   export const prisma = new PrismaClient({ adapter })
   ```

### 4. Configure Better Auth

1. Dynamically capture the URL in the server configuration (`auth.ts`):

   ```typescript
   const getBaseUrl = () => {
     if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL) {
       return `https://${process.env.VERCEL_URL}`
     }
     return process.env.BETTER_AUTH_URL || 'http://localhost:3000'
   }

   export const auth = betterAuth({
     baseURL: getBaseUrl(),
     // ... rest of the configuration
   })
   ```

2. Remove explicit URLs in the client configuration (`auth-client.ts`):

   ```typescript
   import { createAuthClient } from 'better-auth/react'

   export const authClient = createAuthClient({
     // baseURL is omitted (automatic detection)
   })
   ```

### 5. Test Setup & Dummy Env

1. Create a `.env.test` file in the root directory and fill it with dummy data:
   ```env
   DATABASE_URL="postgresql://fake:fake@localhost:5432/fake"
   DATABASE_URL_UNPOOLED="postgresql://fake:fake@localhost:5432/fake"
   ```
2. Commit this file to the Git repository.

### 6. Prepare Neon API Credentials for GitHub

1. In the Neon Dashboard, copy the **Project ID** from the settings (Format: `bold-fog-...`).
2. Under **Account Settings -> API Keys**, create a new key and copy it.
3. Enter the following in the GitHub Repository under **Settings -> Secrets and variables -> Actions**:
   - Under **Repository secrets**: Create a new secret `NEON_API_KEY` with the copied API Key.
   - Under **Repository variables**: Create a new variable `NEON_PROJECT_ID` with the copied Project ID.

### 7. Create GitHub Actions Workflow Files (CI & Cleanup)

1. Create the path `.github/workflows/` in the local project.
2. Create the `test.yml` file inside it:

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

3. Create the `delete-neon-branch.yml` file in the same folder:

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

### 8. Initial Run on GitHub (Preparation for Branch Protection)

1. Create a new branch locally: `git checkout -b setup-ci`
2. Commit the newly created workflow files: `git add .` followed by `git commit -m "ci: setup workflows"`
3. Push the branch: `git push origin setup-ci`
4. Go to GitHub and open a **Pull Request** from `setup-ci` into `master`.
5. Wait until the `Run Unit/Integration Tests` check in the PR view has finished (the yellow symbol will turn into a green checkmark).

### 9. Enable Branch Protection on GitHub

1. On GitHub, add a new "Branch protection rule" under **Settings -> Branches** (or edit the existing one for `master`).
2. Branch name pattern: `master`
3. Check the box: **Require status checks to pass before merging**.
4. Search for `Run Unit/Integration Tests` in the search field and select the job.
5. Save.
6. Complete the PR from Step 8 using "Squash and merge". (This will also trigger the automatic deletion of the Neon branch for the first time).
7. Clean up locally: `git checkout master`, `git pull origin master`, `git branch -D setup-ci`.

### 10. The Daily Workflow (Summary)

1. **Develop locally:** `git checkout -b my-feature` (Work with local `.env.development` and DEV database).
2. **Push:** `git push origin my-feature`
3. **Pull Request:** Open a PR on GitHub.
4. **Automation Start:** GitHub Actions run tests. Vercel & Neon provide a preview environment.
5. **Review:** Test the Vercel Preview URL.
6. **Merge:** Click "Squash and merge" on GitHub (triggers Vercel Prod deployment).
7. **Automation End:** GitHub Action automatically deletes the temporary Neon branch.
8. **Clean up:** Switch to `master` locally, run `git pull`, and use `git branch -D my-feature` to remove the local branch.

---

## Part 3: Troubleshooting (Known Issues & Solutions)

### 1. BetterAuth "Invalid Origin" / 403 Forbidden in Previews

In Vercel preview environments, login or sign-up often fails with a **403 Forbidden** error or an **"Invalid Origin"** toast. This is caused by BetterAuth's strict CSRF protection, which compares the browser URL with the configured `baseURL`.

**The Cause:**
Vercel generates two types of URLs for every deployment:

1.  **The Deployment URL (ID-URL):** Contains a random ID (e.g., `project-id-username.vercel.app`).
2.  **The Branch URL (Alias):** The "friendly name" that includes the Git branch name.

By default, Vercel populates the `VERCEL_URL` variable only with the **ID-URL**. If you access the site via the "friendly" Branch URL, BetterAuth detects a mismatch and blocks the request.

**The Solution:**
Adjust the `getBaseUrl` logic in `auth.ts` to prioritize the Branch URL and enable `trustHost` mode:

1.  **Code Adjustment in `auth.ts`:**

    ```typescript
    const getBaseUrl = () => {
      if (process.env.VERCEL_ENV === 'preview') {
        // Use the friendly branch name if available, otherwise fallback to the ID-URL
        const url = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL
        return `https://${url}`
      }
      return process.env.BETTER_AUTH_URL || 'http://localhost:3000'
    }

    export const auth = betterAuth({
      baseURL: getBaseUrl(),
      advanced: {
        trustHost: true, // Allows BetterAuth to trust Vercel's host headers
        cookiePrefix: 'your-project-name',
      },
      // ... remaining configuration
    })
    ```

2.  **Vercel Settings:**
    In your Vercel project settings, go to **Settings -> Environment Variables** and ensure that the option **"Automatically expose System Environment Variables"** is enabled. This makes `VERCEL_BRANCH_URL` available to your code.

**Best Practice for Testing:**
If login via the Branch URL ("friendly name") still causes issues, always use the **Deployment URL (ID-URL)** for manual
