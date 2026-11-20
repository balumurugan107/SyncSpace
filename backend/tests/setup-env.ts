import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Runs before any test module is imported, so `config` (loaded at import time)
 * sees test settings. Tests use the separate `syncspace_test` database, created by
 * docker/postgres/init on first start, so they never touch development data.
 */
const rootEnv = path.resolve(import.meta.dirname, '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const user = process.env.POSTGRES_USER ?? 'syncspace';
const password = process.env.POSTGRES_PASSWORD ?? '';
const port = process.env.POSTGRES_HOST_PORT ?? '5432';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@localhost:${port}/syncspace_test`;
// Redis database 1 (the running stack uses 0) and a private Pub/Sub channel, so tests
// never touch development data or show up in the running instances' event logs.
const redisPassword = process.env.REDIS_PASSWORD ?? '';
const redisPort = process.env.REDIS_HOST_PORT ?? '6379';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? `redis://:${encodeURIComponent(redisPassword)}@localhost:${redisPort}/1`;
process.env.EVENTS_CHANNEL = 'syncspace:test:events';
process.env.API_RATE_LIMIT_MAX = '100000';
process.env.INSTANCE_ID = 'test-instance';
process.env.MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../migrations');
process.env.JWT_ACCESS_SECRET ??= 'test-only-secret-that-is-at-least-32-characters-long';
process.env.BCRYPT_ROUNDS = '4';
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.CORS_ORIGINS = 'http://localhost:5173';
