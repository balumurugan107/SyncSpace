import { cache, type CacheScope } from '../infrastructure/cache/cache.js';
import { eventBus } from '../infrastructure/events/index.js';
import type { NewDomainEvent } from '../infrastructure/events/event-bus.js';

/**
 * Run after a write transaction has COMMITTED (never inside it: if the transaction
 * rolled back, we would have invalidated and announced a change that never happened).
 *
 * 1. Invalidate cache generations synchronously, before the HTTP response, so the
 *    client's very next read (often an immediate refetch) cannot hit stale data.
 * 2. Publish a domain event to every API instance via Redis Pub/Sub.
 *
 * Both steps are best-effort: Redis being down must not turn a successful write into
 * an error response.
 */
export async function afterCommit(change: NewDomainEvent & { scopes: CacheScope[] }): Promise<void> {
  const { scopes, ...event } = change;
  await cache.invalidate(scopes);
  await eventBus.publish(event);
}

/** Invalidation only, for changes that are not tied to one workspace (e.g. a renamed user). */
export function invalidate(scopes: CacheScope[]): Promise<void> {
  return cache.invalidate(scopes);
}
