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

    // Queue Configuration
    QUEUE_CONCURRENCY: z.coerce.number().min(1).max(100).default(5),

    // Task Enqueue Cron (polls pending tasks and adds to queue)
    CRON_TASK_ENQUEUE_ENABLED: z.coerce.boolean().default(true),
    CRON_TASK_ENQUEUE_INTERVAL: z.string().default('*/5 * * * * *'), // Every 5 seconds
    CRON_TASK_ENQUEUE_BATCH_SIZE: z.coerce.number().min(1).max(100).default(20),

    // Task Timeout Recovery Cron (resets stuck tasks)
    CRON_TASK_TIMEOUT_ENABLED: z.coerce.boolean().default(true),
    CRON_TASK_TIMEOUT_INTERVAL: z.string().default('*/30 * * * * *'), // Every 30 seconds
    CRON_TASK_TIMEOUT_MINUTES: z.coerce.number().min(1).max(1440).default(10),

    // Order Close Cron (closes expired payment orders)
    CRON_ORDER_CLOSE_ENABLED: z.coerce.boolean().default(true),
    CRON_ORDER_CLOSE_INTERVAL: z.string().default('0 * * * * *'), // Every 1 minute
    CRON_ORDER_CLOSE_BATCH_SIZE: z.coerce.number().min(1).max(100).default(50),

    GIFT_AMOUNT: z.coerce.number().default(0),
    ANALYSIS_PRICE: z.coerce.number().default(0),

    // WeChat Pay Configuration (敏感信息) - 可选，不配置则微信支付功能不可用
    WECHAT_PAY_APPID: z.string().min(1).optional(),
    WECHAT_PAY_MCHID: z.string().min(1).optional(),
    WECHAT_PAY_API_V3_KEY: z.string().min(32).optional(), // APIv3密钥，32字节
    WECHAT_PAY_SERIAL_NO: z.string().min(1).optional(), // 商户证书序列号
    WECHAT_PAY_PRIVATE_KEY: z.string().min(1).optional(), // 商户私钥 (PEM格式)
    WECHAT_PAY_NOTIFY_URL: z.string().url().optional(), // 支付回调通知地址
    WECHAT_PAY_PLATFORM_CERT: z.string().optional(), // 微信支付平台证书（可选，首次自动下载）
    WECHAT_PAY_PLATFORM_CERT_SERIAL_NO: z.string().optional(), // 微信支付平台证书序列号

    // Alipay Configuration (敏感信息) - 可选，不配置则支付宝支付功能不可用
    ALIPAY_APPID: z.string().min(1).optional(), // 支付宝应用ID
    ALIPAY_PRIVATE_KEY: z.string().min(1).optional(), // 应用私钥 (PKCS1/PKCS8格式)
    ALIPAY_PUBLIC_KEY: z.string().min(1).optional(), // 支付宝公钥 (非应用公钥)
    ALIPAY_NOTIFY_URL: z.string().url().optional(), // 支付回调通知地址
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

    // Queue
    QUEUE_CONCURRENCY: process.env.QUEUE_CONCURRENCY,

    // Task Enqueue Cron
    CRON_TASK_ENQUEUE_ENABLED: process.env.CRON_TASK_ENQUEUE_ENABLED,
    CRON_TASK_ENQUEUE_INTERVAL: process.env.CRON_TASK_ENQUEUE_INTERVAL,
    CRON_TASK_ENQUEUE_BATCH_SIZE: process.env.CRON_TASK_ENQUEUE_BATCH_SIZE,

    // Task Timeout Recovery Cron
    CRON_TASK_TIMEOUT_ENABLED: process.env.CRON_TASK_TIMEOUT_ENABLED,
    CRON_TASK_TIMEOUT_INTERVAL: process.env.CRON_TASK_TIMEOUT_INTERVAL,
    CRON_TASK_TIMEOUT_MINUTES: process.env.CRON_TASK_TIMEOUT_MINUTES,

    // Order Close Cron
    CRON_ORDER_CLOSE_ENABLED: process.env.CRON_ORDER_CLOSE_ENABLED,
    CRON_ORDER_CLOSE_INTERVAL: process.env.CRON_ORDER_CLOSE_INTERVAL,
    CRON_ORDER_CLOSE_BATCH_SIZE: process.env.CRON_ORDER_CLOSE_BATCH_SIZE,

    GIFT_AMOUNT: process.env.GIFT_AMOUNT,
    ANALYSIS_PRICE: process.env.ANALYSIS_PRICE,

    // WeChat Pay
    WECHAT_PAY_APPID: process.env.WECHAT_PAY_APPID,
    WECHAT_PAY_MCHID: process.env.WECHAT_PAY_MCHID,
    WECHAT_PAY_API_V3_KEY: process.env.WECHAT_PAY_API_V3_KEY,
    WECHAT_PAY_SERIAL_NO: process.env.WECHAT_PAY_SERIAL_NO,
    WECHAT_PAY_PRIVATE_KEY: process.env.WECHAT_PAY_PRIVATE_KEY,
    WECHAT_PAY_NOTIFY_URL: process.env.WECHAT_PAY_NOTIFY_URL,
    WECHAT_PAY_PLATFORM_CERT: process.env.WECHAT_PAY_PLATFORM_CERT,
    WECHAT_PAY_PLATFORM_CERT_SERIAL_NO: process.env.WECHAT_PAY_PLATFORM_CERT_SERIAL_NO,

    // Alipay
    ALIPAY_APPID: process.env.ALIPAY_APPID,
    ALIPAY_PRIVATE_KEY: process.env.ALIPAY_PRIVATE_KEY,
    ALIPAY_PUBLIC_KEY: process.env.ALIPAY_PUBLIC_KEY,
    ALIPAY_NOTIFY_URL: process.env.ALIPAY_NOTIFY_URL,
  },
  /*
   * Skip validation during build time (e.g., in CI/CD)
   * Set SKIP_ENV_VALIDATION=1 to skip validation
   * Runtime validation will still occur if env vars are accessed
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
})
