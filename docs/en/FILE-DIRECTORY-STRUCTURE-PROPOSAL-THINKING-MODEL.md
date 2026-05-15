# File/Directory Structure for a TanStack Start Fullstack Project

## Requirements

How would you recommend organizing the file and directory structure for a TanStack Start project? The following conditions apply:

- **Styling:** shadcn/ui (and thus TailwindCSS version 4) should be used.
- **Testing:** Individual functions must be covered by tests using Vitest.
- **ORM:** Prisma should be utilized.
- **Database:** PostgreSQL.
- **Authentication:** betterAuth should be used.
- **Server Functions:** The "SERVER FUNCTION SYSTEM" (SFS) described in this Gem must be implemented (the specific file locations aren't "binding," they just describe how it was chosen early in a project without deep knowledge of potential issues arising from the structure).
- **DB Hosting:** Neon.
- **App Hosting:** Vercel.
- **Integration:** Use the Neon/Vercel integration (set up from the Neon side, as it offers more generous limits for the number of integrations compared to vice versa).
- **Code Repository:** GitHub.
- **Deployment Workflow:** As described in the Gem's MD files (i.e., git branches for development, pull requests required for merging into the main branch, with passing tests as a prerequisite).
- **Long-running Tasks (Optional):** It should be possible to run long-running tasks somewhere outside of Vercel (due to Vercel's strict timeouts for single server functions).

## Proposed Solution

Here is my suggestion for the optimal layout:

## 📂 Recommended Project Structure

```text
/
├── .github/workflows/          # CI/CD (Vitest, Linting, Vercel Deployment)
├── prisma/                     # Prisma Schema & Migrations
│   ├── schema.prisma           # Definition of DB models (Neon/PostgreSQL)
│   └── seed.ts                 # Seeding logic for development
├── public/                     # Static assets (Favicons, Logos)
├── src/
│   ├── components/             # UI Components
│   │   ├── ui/                 # Shadcn/ui components (Tailwind v4)
│   │   └── web/                # Project-specific features (e.g., Note-Card)
│   ├── data/                   # SERVER FUNCTION SYSTEM (SFS)
│   │   ├── [feature]/          # Grouped by feature (e.g., "course")
│   │   │   ├── course.ts       # Transport: Server Function definitions (RPC)
│   │   │   ├── course.logic.server.ts # Logic: Pure server-side logic (Prisma)
│   │   │   └── course.test.ts  # Vitest: Unit tests for business logic
│   ├── hooks/                  # Custom React Hooks
│   ├── lib/                    # Core Infrastructure
│   │   ├── db.server.ts        # Prisma Client instance (Singleton)
│   │   ├── rpc.ts              # SFS Factories (authGetFn, authPostFn)
│   │   ├── utils.ts            # Shadcn/ui helpers (cn)
│   │   └── error-handler.server.ts # Global error handling (Layer 1)
│   ├── routes/                 # TanStack Router (File-based Routing)
│   │   ├── __root.tsx          # Root layout & TanStack Query setup
│   │   └── index.tsx           # Dashboard / Landing Page
│   ├── schemas/                # Shared Zod schemas (Search Params, Forms)
│   ├── styles/                 # TailwindCSS v4 Entry Point
│   │   └── globals.css         # @theme variables & imports
│   ├── types/                  # Global TypeScript interfaces & SFS types
│   ├── worker/                 # OPTIONAL: Long-running task logic
│   │   └── heavy-tasks.ts      # Logic for external triggers (e.g., Inngest/Hetzner)
│   ├── app.config.ts           # TanStack Start / Vite configuration
│   ├── entry-client.tsx        # Browser hydration
│   └── entry-server.tsx        # SSR rendering
├── vitest.config.ts            # Test configuration
└── package.json

```

---

## 🛠 Why This Design?

### 1. The SFS Duo (`.ts` vs. `.logic.server.ts`)

To prevent server-side code from "leaking" into the client bundle, we separate every Server Function:

- **`course.ts`**: Here you only define the `createServerFn`. It imports the logic file **dynamically** within the handler. This keeps your client bundle extremely small.
- **`course.logic.server.ts`**: This is the "scalpel." It has full access to Prisma and Node modules. Because it ends in `.server.ts`, it is completely ignored by the Vite bundler for the client side.

### 2. Testing with Vitest

Tests are located directly next to the logic in the `data/` directory, which improves maintainability. By decoupling the business logic in the `*.logic.server.ts` files from the TanStack infrastructure, you can test these as "Pure Functions" in Vitest without having to simulate the entire server.

### 3. URL State & Schemas

We use a central `schemas/` folder for things like `search-params.ts`. This serves as the "Source of Truth" for your search and pagination. Since both the route (`validateSearch`) and the Server Function (`validator`) access it, you get end-to-end type safety.

### 4. Long-running Tasks (Vercel Timeout)

Vercel has limits (often 10-60s). For tasks like "Parsing Udemy HTML for 100 courses," this isn't enough.

- **Recommendation:** Use the `worker/` structure to define logic triggered via a webhook. You can deploy this code on Vercel (for short tasks) or run the same logic on a small instance (e.g., Hetzner/Railway) via Docker if you hit timeout issues.

### 5. Neon & Vercel Workflow

The integration ensures that your `DATABASE_URL` automatically ends up in the Vercel Environment Variables. By using **feature branches** and **pull requests** in GitHub, you ensure that Prisma migrations are tested before they reach the `main` branch and the production database.

---

## 💡 Next Steps

This layout is ready for use. Do you need specific prompts for **Gemini Code Assist** for any of these areas (e.g., the specific Vitest configuration for Prisma or connecting external workers)?

Otherwise, my question for you:
Should I show you how to specifically configure `app.config.ts` for Tailwind v4 and Vitest to optimally support this directory layout?
