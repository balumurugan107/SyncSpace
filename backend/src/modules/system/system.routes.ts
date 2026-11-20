import { Router } from 'express';
import { pool } from '../../infrastructure/database/pool.js';
import { instance } from '../../infrastructure/instance.js';
import { redis } from '../../infrastructure/redis/redis.js';
import { authenticate, requireUser } from '../../shared/middleware/authenticate.js';
import { recentEvents } from './event-log.js';
import { currentReport, listInstances } from './instance-registry.js';

/** /api/system: cluster view for the System Health page. Requires sign-in. */
export const systemRouter = Router();
systemRouter.use(authenticate);

/** Every live API instance, read from the Redis heartbeat registry. */
systemRouter.get('/instances', async (_req, res) => {
  let instances;
  let registry: 'redis' | 'unavailable' = 'redis';
  try {
    instances = await listInstances();
  } catch {
    // Without Redis we can only describe ourselves.
    instances = [currentReport()];
    registry = 'unavailable';
  }
  let redisInfo: Record<string, string> | null = null;
  try {
    const info = await redis.info();
    const wanted = ['redis_version', 'used_memory_human', 'connected_clients', 'total_commands_processed', 'keyspace_hits', 'keyspace_misses'];
    redisInfo = Object.fromEntries(
      info
        .split('\r\n')
        .map((line) => line.split(':') as [string, string])
        .filter(([name]) => wanted.includes(name)),
    );
    redisInfo.keys = String(await redis.dbsize());
  } catch {
    redisInfo = null;
  }
  res.json({ servedBy: instance.id, registry, instances, redis: redisInfo });
});

/**
 * Events received by the instance that serves this request, limited to workspaces
 * the caller belongs to (events carry workspace ids, which are not public).
 */
systemRouter.get('/events', async (req, res) => {
  const { rows } = await pool.query<{ workspaceId: string }>(
    'SELECT workspace_id AS "workspaceId" FROM workspace_members WHERE user_id = $1',
    [requireUser(req.user).id],
  );
  res.json({ servedBy: instance.id, events: recentEvents(new Set(rows.map((r) => r.workspaceId)), 50) });
});
