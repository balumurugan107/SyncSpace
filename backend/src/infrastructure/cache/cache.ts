import type { Redis } from 'ioredis';
import { config } from '../../config/env.js';
import { metrics } from '../instance.js';
import { logger } from '../logging/logger.js';
import { redis } from '../redis/redis.js';

/**
 * Cache-aside with GENERATION-based invalidation.
 *
 * Every cached value depends on one or more "scopes" (a project, a workspace, all
 * users). Each scope has a generation counter in Redis: `gen:project:<id>`. The
 * counters are part of the cache key:
 *
 *     cache:board:<projectId>|project:<id>=7|workspace:<id>=3|users=12
 *
 * A write commits to PostgreSQL, THEN increments the generations it affects. Readers
 * build the key from the current generations, so after the increment they miss and
 * reload from PostgreSQL.
 *
 * Why not just DEL the key after a write? Because of this race:
 *   1. reader misses and SELECTs the old row
 *   2. writer commits and DELs the key
 *   3. reader SETs the old row it read in step 1  -> stale until TTL
 * With generations, the reader in step 3 writes under the OLD generation's key,
 * which nobody reads any more. Old keys simply expire.
 *
 * Redis failures never fail a request: the value is loaded from PostgreSQL and the
 * result is reported as BYPASS.
 */
export type CacheScope = `project:${string}` | `workspace:${string}` | 'users';
export type CacheStatus = 'HIT' | 'MISS' | 'BYPASS';

export interface Cached<T> {
  value: T;
  status: CacheStatus;
}

export function createCache(client: Redis, ttlSeconds: number) {
  const genKey = (scope: CacheScope) => `gen:${scope}`;

  async function keyFor(name: string, scopes: CacheScope[]): Promise<string> {
    const generations = scopes.length ? await client.mget(...scopes.map(genKey)) : [];
    const suffix = scopes.map((scope, i) => `${scope}=${generations[i] ?? 0}`).join('|');
    return `cache:${name}|${suffix}`;
  }

  return {
    async read<T>(name: string, scopes: CacheScope[], load: () => Promise<T>): Promise<Cached<T>> {
      let key: string;
      try {
        key = await keyFor(name, scopes);
        const hit = await client.get(key);
        if (hit !== null) {
          metrics.cacheHits += 1;
          return { value: JSON.parse(hit) as T, status: 'HIT' };
        }
      } catch (error) {
        metrics.cacheErrors += 1;
        logger.warn({ err: error, cache: name }, 'Cache unavailable; reading from PostgreSQL');
        return { value: await load(), status: 'BYPASS' };
      }

      metrics.cacheMisses += 1;
      const value = await load();
      // Store in the background: a slow or failing SET must not delay the response.
      client.set(key, JSON.stringify(value), 'EX', ttlSeconds).catch((error: unknown) => {
        metrics.cacheErrors += 1;
        logger.warn({ err: error, cache: name }, 'Could not store cache entry');
      });
      return { value, status: 'MISS' };
    },

    /** Call AFTER the database transaction has committed. */
    async invalidate(scopes: CacheScope[]): Promise<void> {
      if (scopes.length === 0) return;
      try {
        const pipeline = client.pipeline();
        for (const scope of new Set(scopes)) {
          pipeline.incr(genKey(scope));
          // Generation keys live a little longer than any value built from them.
          pipeline.expire(genKey(scope), ttlSeconds * 2);
        }
        const results = await pipeline.exec();
        const failed = results?.find(([error]) => error);
        if (failed) throw failed[0];
      } catch (error) {
        // Worst case the cached value lives until its TTL. Logged loudly because that
        // is user-visible staleness.
        metrics.cacheErrors += 1;
        logger.error({ err: error, scopes }, 'Cache invalidation failed; entries may be stale until TTL');
      }
    },
  };
}

export type Cache = ReturnType<typeof createCache>;

export const cache = createCache(redis, config.CACHE_TTL_SECONDS);
