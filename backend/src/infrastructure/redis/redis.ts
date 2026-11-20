import { Redis, type RedisOptions } from 'ioredis';
import { config } from '../../config/env.js';
import { logger } from '../logging/logger.js';

/**
 * Redis connections are deliberately configured to FAIL FAST:
 *
 * - enableOfflineQueue: false: while disconnected, commands reject immediately
 *   instead of piling up in memory and stalling requests.
 * - commandTimeout: a slow Redis never holds an HTTP request for long.
 *
 * Every Redis feature in SyncSpace (cache, rate limits, events, heartbeats) treats
 * Redis as an accelerator, not the source of truth, so callers catch these errors
 * and fall back (read PostgreSQL, allow the request, skip the event).
 */
export function createRedis(name: string, overrides: RedisOptions = {}): Redis {
  const client = new Redis(config.REDIS_URL, {
    connectionName: `syncspace-${name}`,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    commandTimeout: 500,
    connectTimeout: 3000,
    // Reconnect forever with capped backoff: Redis may come back at any time.
    retryStrategy: (attempt) => Math.min(attempt * 200, 3000),
    ...overrides,
  });
  let warned = false;
  client.on('error', (error) => {
    // ioredis emits an error per failed reconnect attempt; log the first one only.
    if (!warned) logger.warn({ err: error, connection: name }, 'Redis connection error');
    warned = true;
  });
  client.on('ready', () => {
    if (warned) logger.info({ connection: name }, 'Redis connection restored');
    warned = false;
  });
  return client;
}

/** Shared connection for commands (GET/SET/INCR/PUBLISH...). */
export const redis = createRedis('commands');

/**
 * A connection in SUBSCRIBE mode cannot run other commands, so Pub/Sub needs its own.
 * The offline queue is enabled here so the subscription is re-established
 * automatically after a reconnect.
 */
export const redisSubscriber = createRedis('subscriber', { enableOfflineQueue: true, maxRetriesPerRequest: null, commandTimeout: undefined });

export async function checkRedis(client: Redis = redis): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const started = performance.now();
  try {
    await client.ping();
    return { ok: true, latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    return { ok: false, latencyMs: Math.round(performance.now() - started), error: error instanceof Error ? error.message : String(error) };
  }
}

export async function closeRedis(): Promise<void> {
  await Promise.allSettled([redis.quit(), redisSubscriber.quit()]);
}
