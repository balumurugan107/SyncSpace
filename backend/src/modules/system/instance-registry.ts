import { config } from '../../config/env.js';
import { instance, metrics } from '../../infrastructure/instance.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { redis } from '../../infrastructure/redis/redis.js';

export interface InstanceReport {
  id: string;
  version: string;
  startedAt: string;
  uptimeSeconds: number;
  memoryRssMb: number;
  lastHeartbeatAt: string;
  metrics: typeof metrics;
}

const KEY_PREFIX = 'instance:';

export function currentReport(): InstanceReport {
  return {
    id: instance.id,
    version: config.APP_VERSION,
    startedAt: instance.startedAt.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    memoryRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    lastHeartbeatAt: new Date().toISOString(),
    metrics: { ...metrics },
  };
}

/**
 * Service registry via heartbeats: every few seconds each instance writes its report
 * to `instance:<id>` with a TTL of 3 heartbeats. A crashed instance stops renewing
 * and disappears on its own; no cleanup job needed. Any instance can then list the
 * whole cluster. (Phase 4 uses the same TTL-key idea for user presence.)
 */
async function beat(): Promise<void> {
  const ttlSeconds = Math.ceil((config.HEARTBEAT_INTERVAL_MS * 3) / 1000);
  try {
    await redis.set(`${KEY_PREFIX}${instance.id}`, JSON.stringify(currentReport()), 'EX', ttlSeconds);
  } catch (error) {
    logger.debug({ err: error }, 'Heartbeat skipped (Redis unavailable)');
  }
}

let timer: NodeJS.Timeout | undefined;

export function startHeartbeat(): void {
  void beat();
  timer = setInterval(() => void beat(), config.HEARTBEAT_INTERVAL_MS);
  timer.unref();
}

/** On graceful shutdown, leave the registry immediately instead of waiting for the TTL. */
export async function stopHeartbeat(): Promise<void> {
  if (timer) clearInterval(timer);
  await redis.del(`${KEY_PREFIX}${instance.id}`).catch(() => undefined);
}

export async function listInstances(): Promise<InstanceReport[]> {
  const keys: string[] = [];
  let cursor = '0';
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', `${KEY_PREFIX}*`, 'COUNT', 100);
    cursor = next;
    keys.push(...batch);
  } while (cursor !== '0');
  if (keys.length === 0) return [currentReport()];
  const values = await redis.mget(...keys);
  const reports = values.filter((value): value is string => value !== null).map((value) => JSON.parse(value) as InstanceReport);
  // Other instances are as fresh as their last heartbeat; for ourselves, report live numbers.
  const others = reports.filter((report) => report.id !== instance.id);
  return [...others, currentReport()].sort((a, b) => a.id.localeCompare(b.id));
}
