import path from 'node:path';
import { z } from 'zod';

/**
 * All runtime configuration comes from environment variables and is validated
 * once at startup. If anything is missing or malformed the process refuses to
 * start, so misconfiguration fails loudly instead of at the first request.
 */
const booleanFromString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  MIGRATIONS_DIR: z.string().default(path.join(process.cwd(), 'migrations')),

  /** redis://[:password@]host:port[/db]. Cache, rate limits, pub/sub and the instance registry. */
  REDIS_URL: z.string().url(),
  /** Pub/Sub channel for domain events. Tests use their own so they never reach running instances. */
  EVENTS_CHANNEL: z.string().default('syncspace:events'),
  CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  /** Human-readable name of this API instance; derived from the container's DNS name when unset. */
  INSTANCE_ID: z.string().optional(),
  HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(5000),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_ISSUER: z.string().default('syncspace-api'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  /** A rotated refresh token presented again within this window is treated as a benign race, not theft. */
  REFRESH_TOKEN_REUSE_GRACE_SECONDS: z.coerce.number().int().nonnegative().default(30),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  COOKIE_SECURE: booleanFromString.default(false),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  /** Express "trust proxy" hop count, so req.ip is the real client IP behind a proxy. */
  TRUST_PROXY: z.coerce.number().int().nonnegative().default(0),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  /** Ceiling for all /api traffic per client IP, shared by every instance. */
  API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(1200),
  API_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60 * 1000),

  APP_VERSION: z.string().default('0.4.0'),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const config: AppConfig = loadConfig();
