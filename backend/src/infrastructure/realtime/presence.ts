import type { Redis } from 'ioredis';
import { redis } from '../redis/redis.js';

export const PRESENCE_TTL_MS = 45_000;
/** One sorted-set member per connection: multiple tabs collapse to one user on reads. */
export function createPresence(client: Redis, ttlMs = PRESENCE_TTL_MS) {
  const key = (workspaceId: string) => `presence:${workspaceId}`;
  return {
    async touch(workspaceId: string, userId: string, connectionId: string) {
      const result = await client.multi().zadd(key(workspaceId), Date.now() + ttlMs, `${userId}:${connectionId}`)
        .pexpire(key(workspaceId), ttlMs * 2).exec();
      if (!result || result.some(([error]) => error)) throw new Error('Presence store unavailable');
    },
    async remove(workspaceId: string, userId: string, connectionId: string) {
      await client.zrem(key(workspaceId), `${userId}:${connectionId}`);
    },
    async list(workspaceId: string): Promise<string[]> {
      await client.zremrangebyscore(key(workspaceId), '-inf', Date.now());
      const live = await client.zrangebyscore(key(workspaceId), Date.now(), '+inf');
      return [...new Set(live.map((entry) => entry.split(':')[0]!))];
    },
  };
}
export const presence = createPresence(redis);
