import { Router } from 'express';
import { config } from '../../config/env.js';
import { checkDatabase } from '../../infrastructure/database/pool.js';
import { instance } from '../../infrastructure/instance.js';
import { checkRedis } from '../../infrastructure/redis/redis.js';

export const healthRouter = Router();

/** Liveness: "is the process running?" Never touches dependencies. */
healthRouter.get('/live', (_req, res) => {
  res.json({ status: 'ok' });
});

/**
 * Readiness: "can this instance serve traffic?"
 *
 * - PostgreSQL is CRITICAL: without it nothing works -> 503, so Docker (and later a
 *   load balancer) treats the instance as unhealthy.
 * - Redis is NON-CRITICAL: every Redis feature falls back (cache bypass, fail-open
 *   rate limits, skipped events), so the instance still answers 200 but reports
 *   status "degraded". Taking all instances out of rotation because the cache is
 *   down would turn a slowdown into an outage.
 */
healthRouter.get('/ready', async (_req, res) => {
  const [postgres, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const status = !postgres.ok ? 'down' : !redis.ok ? 'degraded' : 'ok';
  res.status(postgres.ok ? 200 : 503).json({
    status,
    version: config.APP_VERSION,
    environment: config.NODE_ENV,
    instance: instance.id,
    startedAt: instance.startedAt.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    memoryRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    components: {
      postgres: { status: postgres.ok ? 'up' : 'down', critical: true, latencyMs: postgres.latencyMs, error: postgres.error },
      redis: { status: redis.ok ? 'up' : 'down', critical: false, latencyMs: redis.latencyMs, error: redis.error },
    },
  });
});
