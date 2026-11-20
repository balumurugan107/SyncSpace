import type { Request, RequestHandler } from 'express';
import type { Redis } from 'ioredis';
import { metrics } from '../instance.js';
import { logger } from '../logging/logger.js';
import { redis as defaultRedis } from '../redis/redis.js';

export interface RateLimitOptions {
  /** Distinguishes limiters in Redis keys, e.g. "auth" or "api". */
  name: string;
  limit: number;
  windowMs: number;
  /** Who is being limited. Defaults to the client IP (req.ip honours `trust proxy`). */
  key?: (req: Request) => string;
  redis?: Redis;
}

/**
 * Fixed-window rate limiter stored in Redis, so the count is SHARED by every API
 * instance. With an in-memory limiter, N instances behind a load balancer would let
 * a client make N x limit requests.
 *
 *   key = rl:<name>:<client>:<window number>
 *   MULTI; INCR key; PEXPIRE key <window>; EXEC   -> one round trip, atomic
 *
 * Trade-off: a fixed window allows a burst of up to 2 x limit across a window
 * boundary. A sliding window (sorted set per client) is exact but costs more memory
 * and CPU per request; for login throttling the fixed window is enough.
 *
 * FAIL OPEN: if Redis is unreachable the request is allowed and a warning logged.
 * Availability wins over throttling here; bcrypt still makes each guess expensive.
 */
export function rateLimit(options: RateLimitOptions): RequestHandler {
  const client = options.redis ?? defaultRedis;
  const keyOf = options.key ?? ((req: Request) => req.ip ?? 'unknown');

  return async (req, res, next) => {
    const now = Date.now();
    const window = Math.floor(now / options.windowMs);
    const resetSeconds = Math.ceil(((window + 1) * options.windowMs - now) / 1000);
    const key = `rl:${options.name}:${keyOf(req)}:${window}`;

    let count: number;
    try {
      const results = await client.multi().incr(key).pexpire(key, options.windowMs).exec();
      count = Number(results?.[0]?.[1]);
      if (!Number.isFinite(count)) throw new Error('Unexpected INCR result');
    } catch (error) {
      logger.warn({ err: error, limiter: options.name }, 'Rate limiter unavailable; allowing request (fail open)');
      next();
      return;
    }

    // IETF draft "RateLimit" header fields, understood by many HTTP clients.
    res.setHeader('RateLimit-Limit', String(options.limit));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, options.limit - count)));
    res.setHeader('RateLimit-Reset', String(resetSeconds));

    if (count > options.limit) {
      metrics.rateLimited += 1;
      res.setHeader('Retry-After', String(resetSeconds));
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: `Too many requests. Try again in ${resetSeconds} seconds.`,
          details: { limit: options.limit, retryAfterSeconds: resetSeconds },
          requestId: String(req.id ?? ''),
        },
      });
      return;
    }
    next();
  };
}
