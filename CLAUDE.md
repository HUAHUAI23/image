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
pnpm lint:fix         # Run ESLint with auto-fix
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

### Docker Operations
```bash
# Local development with Docker Compose
docker compose up -d              # Start all services (app + database)
docker compose logs -f app        # View application logs
docker compose exec app pnpm db:push  # Run migrations in container
docker compose down               # Stop all services

# Manual Docker build
docker build -t image-generation:latest .
docker run -p 3000:3000 image-generation:latest

# Multi-platform build
docker buildx build --platform linux/amd64,linux/arm64 -t image-generation .
```

See **DOCKER.md** for comprehensive deployment guide.

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
- **Storage**: Volcengine TOS (Object Storage)
- **AI Services**:
  - Doubao VLM (ARK SDK) for image analysis
  - Seedream for image generation

### Directory Structure

```
app/
├── (auth)/               # Auth route group (login, etc.)
├── (dashboard)/          # Main dashboard route group
├── actions/              # Server actions (auth, billing, task, template)
├── api/                  # API routes
│   ├── tasks/           # Task creation API
│   ├── templates/       # Template management
│   ├── upload/          # File upload
│   ├── download/        # File download
│   └── vlm/             # VLM analysis
├── globals.css
└── layout.tsx

components/
├── ui/                   # Radix UI-based shadcn components
├── providers/            # React context providers
├── modals/               # Modal components
└── [feature components]

lib/
├── auth.ts              # JWT session management (encrypt/decrypt/create/delete)
├── env.ts               # Type-safe environment variables via @t3-oss/env-nextjs
├── password.ts          # bcryptjs password hashing utilities
├── queue.ts             # Task queue processor (fastq-based)
├── cron.ts              # Cron job initialization
├── logger.ts            # Pino logger setup
├── tos.ts               # Volcengine TOS upload utilities
├── vlm.ts               # Doubao VLM integration
├── image-generation.ts  # Seedream image generation
├── image-utils.ts       # Image manipulation utilities
├── batch-download.ts    # Batch download utilities
├── validations/         # Zod validation schemas
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
   - Marks pending tasks as `processing` using `SELECT FOR UPDATE SKIP LOCKED` (prevents race conditions)
   - Enqueues up to `CRON_BATCH_SIZE` tasks per cycle (default: 10)
   - Resets timed-out tasks (stuck in `processing` > `TASK_TIMEOUT_MINUTES`) back to `pending`
   - Initialized via `instrumentation.ts` (Next.js 15+ feature)

2. **Task Queue** (`lib/queue.ts`): Processes tasks with configurable concurrency
   - Powered by `fastq` with concurrency controlled by `QUEUE_CONCURRENCY` (default: 5)
   - Validates and locks task using `SELECT FOR UPDATE NOWAIT` (prevents double processing)
   - Loads prompt template if specified
   - Generates images via Seedream API (supports partial success)
   - Uploads successful images to Volcengine TOS
   - Updates task status: `pending → processing → success/partial_success/failed`
   - On failure/partial success: Calculates and issues refund automatically
   - Uses database transactions for atomicity
   - Maintains heartbeat every 5 minutes for long-running tasks

**File Upload**:
- Original images uploaded to TOS: `originalImage/{userId}/`
- Generated images uploaded to TOS: `generatedImage/{userId}/{taskId}/`

**Concurrency Control**:
- `QUEUE_CONCURRENCY`: Number of tasks processed simultaneously (default: 5)
- `SEEDREAM_CONCURRENCY`: Number of concurrent image generation requests per task (default: 20)
- Total concurrent API requests = `QUEUE_CONCURRENCY × SEEDREAM_CONCURRENCY`

### Server Actions

All server actions follow Next.js 15+ pattern with `'use server'` directive:

- **auth.ts**: `loginAction()`, `logoutAction()`, `registerAction()`
- **task.ts**: `createTaskAction()`, `getTasksAction()`
- **billing.ts**: Balance recharge operations
- **template.ts**: Prompt template management

Actions use Zod schemas for validation and return structured responses (e.g., `{ success?, message?, taskId? }`).

### API Routes

API routes in `app/api/` handle specific operations:

- **POST /api/tasks**: Create new task with FormData (handles file upload, balance check, transaction)
- **GET /api/templates**: Fetch prompt templates by category
- **POST /api/upload**: Upload files to TOS
- **GET /api/download**: Download generated images as ZIP
- **POST /api/vlm/analyze**: Analyze image with Doubao VLM

### Environment Variables

Type-safe environment configuration via `@t3-oss/env-nextjs` in `lib/env.ts`:

**Required Server Variables**:
- `DATABASE_URL`: PostgreSQL connection string
- `AUTH_SECRET`: JWT signing secret
- `NODE_ENV`: development | test | production
- `VOLCENGINE_*`: TOS configuration (ACCESS_KEY, SECRET_KEY, REGION, ENDPOINT, BUCKET_NAME)
- `ARK_*`: Doubao VLM configuration (API_KEY, BASE_URL, MODEL)
- `SEEDREAM_*`: Image generation configuration (API_KEY, BASE_URL, MODEL, CONCURRENCY)
- `QUEUE_CONCURRENCY`: Queue worker concurrency (default: 5)
- `CRON_BATCH_SIZE`: Tasks to fetch per cron cycle (default: 10)
- `TASK_TIMEOUT_MINUTES`: Task timeout threshold (default: 30)
- `GIFT_AMOUNT`: New user gift amount (default: 0)
- `ANALYSIS_PRICE`: VLM analysis price (default: 0)

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
2. **API Routes**: Create in `app/api/[route]/route.ts` for FormData or special handling
3. **Database**: Update schema → run `pnpm db:push` → update types
4. **UI**: Use existing components from `components/ui/` or create new ones
5. **Forms**: Use React Hook Form + Zod schemas for validation
6. **Auth**: Use `getSession()` in server actions, redirect to `/login` if unauthenticated

### Task Queue Behavior

- Queue processes `QUEUE_CONCURRENCY` tasks simultaneously (default: 5)
- Cron polls every **5 seconds** for new pending tasks
- Tasks use `SELECT FOR UPDATE NOWAIT` to prevent double processing
- Failed tasks trigger **automatic refunds** via database transaction
- Partial success tasks receive **proportional refunds** based on failure count
- Tasks maintain heartbeat every 5 minutes to prevent timeout
- Stuck tasks (> `TASK_TIMEOUT_MINUTES`) automatically reset to pending

### Code Style

- Import sorting enforced by `eslint-plugin-simple-import-sort`
- Order: React → external packages → internal packages (`@/*`) → relative imports → CSS
- TypeScript strict mode enabled
- Use absolute imports with `@/*` path alias
- Unused vars starting with `_` are ignored by ESLint

### Cron Initialization

The cron worker is automatically initialized via `instrumentation.ts`:
- Next.js 15+ calls `register()` function on server startup
- Only initializes once (prevents duplicate cron jobs)
- Logs "Initializing Cron Worker..." on first run
- **DO NOT** manually call `initCron()` elsewhere

### Image Generation Flow

1. User creates task via `POST /api/tasks` (charges balance, creates transaction)
2. Task marked as `pending` in database
3. Cron worker picks up task and marks as `processing`
4. Queue worker:
   - Validates task and loads template
   - Generates images via Seedream API (with `SEEDREAM_CONCURRENCY`)
   - Uploads successful images to TOS
   - Updates task status and refunds if needed
5. Frontend polls task status every 5 seconds
6. User views results in gallery modal

### Testing Database Changes

Always test database operations with:
1. `pnpm db:studio` for visual inspection
2. `tsx --env-file=.env scripts/[script].ts` for query debugging
3. Check Drizzle query logs in dev mode (enabled in `db/index.ts`)

### Connection Pool Configuration

Database connection pool in `db/index.ts`:
- **max**: 20 connections (adjust based on QUEUE_CONCURRENCY)
- **idleTimeoutMillis**: 30 seconds
- **connectionTimeoutMillis**: 2 seconds
- Recommended: pool size >= `QUEUE_CONCURRENCY * 3 + 10`

## CI/CD and Deployment

### GitHub Actions Workflows

The project includes two automated workflows:

**1. PR Check (`.github/workflows/pr-check.yml`)**
- Triggers on pull requests to `main`/`master`/`develop`
- **Lint and Build Check**: Runs ESLint and Next.js build
- **Docker Build Test**: Validates Dockerfile (AMD64 only for speed)
- **PR Comment**: Posts detailed results to the pull request
- Security: Uses `pull_request_target` with code isolation for PR comments

**2. Docker Build & Push (`.github/workflows/docker-build-push.yml`)**
- Triggers on push to `main`/`master` or manual workflow dispatch
- Builds multi-arch images: `linux/amd64` and `linux/arm64`
- Pushes to GitHub Container Registry: `ghcr.io/<owner>/image-generation`
- Optional: Pushes to Docker Hub (requires `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`)
- Uses GitHub Actions cache for faster builds
- Runs on native architecture runners for optimal performance

### Docker Deployment

**Configuration Requirements:**
- `next.config.ts` must have `output: 'standalone'` (already configured)
- Dockerfile uses multi-stage build for minimal image size
- Health check endpoint at `/api/health` for container orchestration

**Image Registries:**
- **GitHub Container Registry** (default): `ghcr.io/<owner>/image-generation:latest`
- **Docker Hub** (optional): `docker.io/<username>/image-generation:latest`

**Local Testing:**
```bash
docker compose up -d        # Start app + PostgreSQL
curl http://localhost:3000/api/health  # Check health
```

See **DOCKER.md** for complete deployment documentation.

## Troubleshooting

- **Environment variable errors**: Ensure `.env` file exists with all required variables
- **Database connection failures**: Check `DATABASE_URL` format and PostgreSQL server status
- **Task stuck in pending**: Cron automatically initialized via `instrumentation.ts`, check logs
- **Balance not updating**: Check transaction logs in `transactions` table via `pnpm db:studio`
- **Type errors after schema changes**: Restart TypeScript server or run `pnpm build`
- **Cron not running**: Verify `instrumentation.ts` exists and Next.js version >= 15
- **Images not uploading**: Verify Volcengine TOS credentials and bucket permissions
- **Queue overloaded**: Reduce `QUEUE_CONCURRENCY` or `SEEDREAM_CONCURRENCY`
- **Docker build fails**: Check `output: 'standalone'` in `next.config.ts`, verify base image
- **Health check failing**: Ensure database is accessible from container, check `/api/health` logs
