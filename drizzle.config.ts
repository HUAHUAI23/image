import { defineConfig } from 'drizzle-kit'

import { env } from './lib/env'

export default defineConfig({
  schema: ['./db/schema.ts', './db/relation.ts'],
  dialect: 'postgresql',
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
})
