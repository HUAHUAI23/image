# Install dependencies only when needed
FROM node:current-alpine AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat openssl && npm install -g pnpm@10.20.0
WORKDIR /app

# Copy package files and drizzle schema
COPY package.json pnpm-lock.yaml* ./
COPY db ./db
COPY drizzle.config.ts ./

# Install dependencies
RUN \
  if [ -f pnpm-lock.yaml ]; then \
    pnpm install --frozen-lockfile; \
  else \
    echo "Lockfile not found." && exit 1; \
  fi

# Rebuild the source code only when needed
FROM node:current-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/db ./db
COPY --from=deps /app/drizzle.config.ts ./drizzle.config.ts
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED=1
ENV SKIP_ENV_VALIDATION=1

# Install pnpm and build
RUN npm install -g pnpm@10.20.0 && \
    pnpm run build

# Production image, copy all the files and run next
FROM node:current-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
# Uncomment the following line in case you want to disable telemetry during runtime.
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Install runtime dependencies including OpenSSL for database connections
RUN sed -i 's/https/http/' /etc/apk/repositories
RUN apk add --no-cache \
    curl \
    ca-certificates \
    openssl \
  && update-ca-certificates

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Standalone mode doesn't include public files by default, must copy separately
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy necessary config files and database schema for runtime
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/db ./db
COPY --from=builder --chown=nextjs:nodejs /app/drizzle.config.ts ./drizzle.config.ts

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
