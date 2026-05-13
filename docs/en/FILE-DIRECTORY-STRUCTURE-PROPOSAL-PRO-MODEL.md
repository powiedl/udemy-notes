# File/Directory Structure for a TanStack Start Fullstack Project

## Requirements

How would you recommend organizing the file and directory structure for a TanStack Start project? The following prerequisites apply:

- **Styling:** shadcn/ui (and thus TailwindCSS, version 4) should be used.
- **Testing:** Individual functions should be secured with tests using vitest.
- **ORM:** prisma should be used.
- **Database:** PostgreSQL should be used.
- **Authentication:** betterAuth should be used.
- **Server Functions:** The SERVER FUNCTION SYSTEM (as described in this Gem) should be utilized (the specific file locations are not "binding" for you; they merely describe how it was chosen in a specific project early on—without deep knowledge of potential issues arising from the chosen structure).
- **Database Hosting:** The database should be hosted on Neon.
- **App Hosting:** The app itself should be hosted on Vercel.
- **Integration:** The Neon/Vercel integration should be used (the integration should be set up from the Neon side, as it offers a more generous limit for the number of integrations compared to the reverse).
- **Repository:** Github should be used as the code repository.
- **Deployment Workflow:** The workflow described in the MD files in this Gem should be used (i.e., Git branches for development; merging into the main branch requires a Pull Request, which in turn requires tests to pass successfully).
- **Long-running Tasks:** It should optionally be possible to run long-running tasks somewhere outside of Vercel (since Vercel has very tight timeouts for individual Server Functions).

## Proposed Solution

Since we already have very specific requirements (such as the Server Function System, type-safe URL state management, and Vercel as the hosting environment), I will tailor the structure precisely to these guidelines and best practices.

Here is my architectural design for the Udemy-Notes project.

### Recommended Directory Structure

```text
udemy-notes/
├── .github/
│   └── workflows/
│       └── ci.yml                   # CI/CD Pipeline (runs Vitest on PRs)
├── prisma/
│   ├── schema.prisma                # Database model for PostgreSQL (Neon)
│   └── seed.ts                      # Initial database seeding
├── public/                          # Static assets (favicon, logos)
├── src/
│   ├── components/
│   │   ├── ui/                      # Automatically generated shadcn/ui components
│   │   └── web/                     # Custom, reusable UI components (e.g., data-table-pagination.tsx)
│   ├── data/                        # Domain logic & Server Functions (Server Function System)
│   │   ├── course.ts                # Transport layer / RPC entry point (for the client)
│   │   ├── course.logic.server.ts   # Pure business logic / Prisma calls (strictly separated)
│   │   ├── note.ts
│   │   └── note.logic.server.ts
│   ├── hooks/                       # Custom React Hooks (e.g., use-mobile.ts)
│   ├── jobs/                        # (Optional) Definition of long-running tasks
│   │   └── background-tasks.ts
│   ├── lib/                         # Configurations & Utilities
│   │   ├── auth.ts                  # betterAuth server instance
│   │   ├── auth-client.ts           # betterAuth client instance
│   │   ├── client-utils.ts          # Client helpers (e.g., handleAction function)
│   │   ├── db.server.ts             # Prisma Client initialization
│   │   ├── error-handler.server.ts  # Global error middleware
│   │   ├── logging.server.ts        # DB logging logic
│   │   ├── rpc.ts                   # Factories for Server Functions (baseServerFn, authGetFn)
│   │   └── server-utils.server.ts   # wrapServerAction wrapper
│   ├── middlewares/
│   │   └── auth.ts                  # Router middleware (session checks)
│   ├── routes/                      # File-based routing via TanStack Router
│   │   ├── __root.tsx
│   │   ├── index.tsx
│   │   ├── _content/                # Layout route (e.g., with sidebar/navbar)
│   │   │   ├── courses/
│   │   │   │   ├── index.tsx        # Including loaderDeps and useDeferredValue for pagination
│   │   │   │   └── $courseId.tsx
│   │   │   └── route.tsx            # Layout for _content
│   │   └── api/
│   │       └── auth/
│   │           └── $.ts             # API route for betterAuth (Catch-all)
│   ├── schemas/                     # Zod schemas
│   │   ├── search-params.ts         # Central search params (PAGINATION_DEFAULTS)
│   │   └── course.ts                # Validation schemas (mutations/inputs)
│   ├── types/                       # Global TypeScript types
│   │   ├── api.ts                   # ActionResponse types
│   │   └── errors.ts                # ServerActionError class
│   ├── app.css                      # Tailwind v4 main file (Imports @tailwindcss)
│   ├── entry-client.tsx             # TanStack Start client hydration
│   ├── entry-server.tsx             # TanStack Start server rendering
│   └── router.tsx                   # TanStack Router setup
├── .env                             # Environment variables (Neon DB URL, Vercel Auth, etc.)
├── app.config.ts                    # TanStack Start & Vite configuration
├── components.json                  # shadcn/ui configuration
├── package.json
└── vitest.config.ts                 # Vitest configuration
```
