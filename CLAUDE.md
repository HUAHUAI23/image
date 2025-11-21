# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AI-powered image generation platform built with Next.js 16 (App Router), featuring text-to-image and image-to-image generation capabilities. The application includes user authentication, balance management, task queuing, and automated processing with a cron-based worker system.

## Common Commands

### Development
```bash
pnpm dev              # Start development server (localhost:3000)
pnpm build            # Build for production
pnpm start            # Start production server
pnpm lint             # Run ESLint
```

### Database Operations
```bash
pnpm db:setup         # Setup database (create if not exists)
pnpm db:reset         # Reset database and push schema
pnpm db:push          # Setup database and push schema changes
pnpm db:studio        # Open Drizzle Studio (database GUI)
pnpm db:generate      # Generate migration files
pnpm db:migrate       # Run migrations
```

**Important**: Always use `tsx --env-file=.env` when running standalone database scripts to ensure environment variables are loaded correctly.

## Architecture Overview

### Core Technology Stack
- **Framework**: Next.js 16 with App Router (React 19.2.0)
- **Database**: PostgreSQL via Drizzle ORM (v0.44.7)
- **Authentication**: Custom JWT-based auth using `jose` library
- **Styling**: Tailwind CSS v4 with Radix UI components
- **Forms**: React Hook Form with Zod validation
- **State**: Zustand for client state, TanStack Query for server state
- **Queue**: fastq for in-memory task processing
- **Cron**: croner for scheduled job execution

### Directory Structure

```
app/
├── (auth)/               # Auth route group (login, etc.)
├── (dashboard)/          # Main dashboard route group
├── actions/              # Server actions (auth, billing, task, template)
├── globals.css
└── layout.tsx

components/
├── ui/                   # Radix UI-based shadcn components
├── providers.tsx         # Query client & toast provider
├── modals/               # Modal components
└── [feature components]

lib/
├── auth.ts              # JWT session management (encrypt/decrypt/create/delete)
├── env.ts               # Type-safe environment variables via @t3-oss/env-nextjs
├── password.ts          # bcryptjs password hashing utilities
├── queue.ts             # Task queue processor (fastq-based)
├── cron.ts              # Cron job initialization
├── logger.ts            # Pino logger setup
└── utils.ts             # Utility functions (cn, etc.)

db/
├── schema.ts            # Drizzle schema definitions
├── relation.ts          # Drizzle table relationships
├── index.ts             # Database client initialization (pg Pool)
└── logger.ts            # Drizzle query logger

scripts/
├── setup-db.ts          # Database setup script
└── reset-db.ts          # Database reset script
```

### Database Schema

The application uses PostgreSQL with Drizzle ORM. Key tables:

- **users**: User accounts with username and avatar
- **userIdentities**: Multi-provider authentication (password, google, github)
- **accounts**: User balance management (one-to-one with users)
- **tasks**: Image generation tasks with status tracking
- **prices**: Task pricing configuration by type
- **transactions**: Financial transaction history (charge/refund)
- **promptTemplates**: Reusable prompt templates by category

**Schema Location**: `db/schema.ts` and `db/relation.ts` (must be in sync with `drizzle.config.ts`)

### Authentication System

Custom JWT-based authentication (no external services like Clerk/NextAuth):
- Session stored as httpOnly cookie (7-day expiration)
- JWT signed with HS256 using `jose` library
- Session payload contains `{ userId, expiresAt }`
- Key functions in `lib/auth.ts`: `createSession()`, `getSession()`, `deleteSession()`, `encrypt()`, `decrypt()`
- Password hashing via bcryptjs in `lib/password.ts`

### Task Processing System

**Two-Stage Architecture**:

1. **Cron Worker** (`lib/cron.ts`): Runs every 5 seconds
   - Polls database for tasks with `status='pending'`
   - Enqueues up to 10 pending tasks at a time
   - Uses in-memory deduplication (`Set<number>`) to prevent double-enqueuing

2. **Task Queue** (`lib/queue.ts`): Processes tasks sequentially
   - Powered by `fastq` with concurrency=1
   - Simulates VLM analysis (2s) and image generation (3s)
   - Updates task status: `pending → processing → success/failed`
   - On failure: Refunds balance and creates refund transaction
   - Uses database transactions for atomicity

**File Upload**: Images saved to `public/uploads/` via `app/actions/task.ts`

### Server Actions

All server actions follow Next.js 15+ pattern with `'use server'` directive:

- **auth.ts**: `loginAction()`, `logoutAction()`, `registerAction()`
- **task.ts**: `createTaskAction()`, `getTasksAction()`
- **billing.ts**: Balance recharge operations
- **template.ts**: Prompt template management

Actions use Zod schemas for validation and return structured responses (e.g., `{ success?, message?, taskId? }`).

### Environment Variables

Type-safe environment configuration via `@t3-oss/env-nextjs` in `lib/env.ts`:

**Required Server Variables**:
- `DATABASE_URL`: PostgreSQL connection string
- `AUTH_SECRET`: JWT signing secret (default: 'default-secret-key-change-me')
- `NODE_ENV`: development | test | production

Set `SKIP_ENV_VALIDATION=1` to skip validation during build (e.g., CI/CD).

### UI Components

Using shadcn/ui components based on Radix UI primitives:
- All components in `components/ui/`
- Styled with Tailwind CSS v4
- ESLint configured to ignore `components/ui/**` (generated code)
- Use `cn()` utility from `lib/utils.ts` for conditional classes
- Toaster notifications via `sonner` (configured in `components/providers.tsx`)

### State Management

- **Server State**: TanStack Query (React Query v5) for data fetching/caching
- **Client State**: Zustand for global UI state (modals, etc.)
- **Forms**: React Hook Form with `@hookform/resolvers` for Zod integration

## Development Guidelines

### Database Workflow

When modifying database schema:
1. Edit `db/schema.ts` or `db/relation.ts`
2. Run `pnpm db:push` to apply changes (dev/prototyping)
3. For production migrations: `pnpm db:generate` → `pnpm db:migrate`
4. Always test with `pnpm db:studio` to verify schema changes

### Adding New Features

1. **Server Actions**: Create in `app/actions/[feature].ts` with `'use server'`
2. **Database**: Update schema → run `pnpm db:push` → update types
3. **UI**: Use existing components from `components/ui/` or create new ones
4. **Forms**: Use React Hook Form + Zod schemas for validation
5. **Auth**: Use `getSession()` in server actions, redirect to `/login` if unauthenticated

### Task Queue Behavior

- Queue processes tasks **one at a time** (concurrency=1)
- Cron polls every **5 seconds** for new pending tasks
- Tasks are **not automatically retried** on failure (manual retry needed)
- Failed tasks trigger **automatic refunds** via database transaction
- Mock image generation uses `https://picsum.photos/seed/{taskId}/1024/1024`

### Code Style

- Import sorting enforced by `eslint-plugin-simple-import-sort`
- Order: React → external packages → internal packages → relative imports → CSS
- TypeScript strict mode enabled
- Use absolute imports with `@/*` path alias

### Cron Initialization

The cron worker must be manually initialized:
- Call `initCron()` from `lib/cron.ts` in a server component or API route
- Only initializes once (prevents duplicate cron jobs)
- Logs "Initializing Cron Worker..." on first run

### Testing Database Changes

Always test database operations with:
1. `pnpm db:studio` for visual inspection
2. `tsx --env-file=.env scripts/test-db-logger.ts` for query debugging
3. Check Drizzle query logs in dev mode (enabled in `db/index.ts`)

## Troubleshooting

- **Environment variable errors**: Ensure `.env` file exists with all required variables
- **Database connection failures**: Check `DATABASE_URL` format and PostgreSQL server status
- **Task stuck in pending**: Verify cron is initialized with `initCron()`
- **Balance not updating**: Check transaction logs in `transactions` table
- **Type errors after schema changes**: Restart TypeScript server or run `pnpm build`