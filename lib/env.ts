import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const env = createEnv({
  /*
   * Serverside Environment variables, not available on the client.
   * Will throw if you access these variables on the client.
   */
  server: {
    DATABASE_URL: z.url(),
    AUTH_SECRET: z.string().min(1),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    // Volcengine TOS (Object Storage)
    VOLCENGINE_ACCESS_KEY: z.string().min(1),
    VOLCENGINE_SECRET_KEY: z.string().min(1),
    VOLCENGINE_REGION: z.string().min(1),
    VOLCENGINE_ENDPOINT: z.string().min(1),
    VOLCENGINE_BUCKET_NAME: z.string().min(1),

    // Doubao VLM (ARK SDK)
    ARK_API_KEY: z.string().min(1),
    ARK_BASE_URL: z.url(),
    ARK_MODEL: z.string().min(1),

    // Seedream (Image Generation)
    SEEDREAM_API_KEY: z.string().min(1),
    SEEDREAM_BASE_URL: z.url(),
    SEEDREAM_MODEL: z.string().min(1),
    SEEDREAM_CONCURRENCY: z.coerce.number().default(20),

    GIFT_AMOUNT: z.coerce.number().default(0),
    ANALYSIS_PRICE: z.coerce.number().default(0),
  },
  /*
   * Environment variables available on the client (and server).
   *
   * 💡 You'll get type errors if these are not prefixed with NEXT_PUBLIC_.
   */
  client: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
  },
  /*
   * Specify what values should be validated by your schemas above.
   *
   * For scripts and non-Next.js contexts, we need to specify runtimeEnv explicitly
   * For Next.js contexts, experimental__runtimeEnv handles client-side variables
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,

    // Volcengine TOS
    VOLCENGINE_ACCESS_KEY: process.env.VOLCENGINE_ACCESS_KEY,
    VOLCENGINE_SECRET_KEY: process.env.VOLCENGINE_SECRET_KEY,
    VOLCENGINE_REGION: process.env.VOLCENGINE_REGION,
    VOLCENGINE_ENDPOINT: process.env.VOLCENGINE_ENDPOINT,
    VOLCENGINE_BUCKET_NAME: process.env.VOLCENGINE_BUCKET_NAME,

    // Doubao VLM
    ARK_API_KEY: process.env.ARK_API_KEY,
    ARK_BASE_URL: process.env.ARK_BASE_URL,
    ARK_MODEL: process.env.ARK_MODEL,

    // Seedream
    SEEDREAM_API_KEY: process.env.SEEDREAM_API_KEY,
    SEEDREAM_BASE_URL: process.env.SEEDREAM_BASE_URL,
    SEEDREAM_MODEL: process.env.SEEDREAM_MODEL,
    SEEDREAM_CONCURRENCY: process.env.SEEDREAM_CONCURRENCY,
    GIFT_AMOUNT: process.env.GIFT_AMOUNT,
    ANALYSIS_PRICE: process.env.ANALYSIS_PRICE,
  },
  /*
   * Skip validation during build time (e.g., in CI/CD)
   * Set SKIP_ENV_VALIDATION=1 to skip validation
   * Runtime validation will still occur if env vars are accessed
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
})
