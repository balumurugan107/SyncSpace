import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Redis } from 'ioredis';
import { metrics } from '../instance.js';
import { logger } from '../logging/logger.js';

/** A fact about something that has ALREADY been committed to PostgreSQL. */
export interface DomainEvent {
  id: string;
  type: string;
  workspaceId: string;
  projectId: string | null;
  taskId: string | null;
  actorId: string;
  memberId?: string;
  occurredAt: string;
  /** Instance that committed the change and published the event. */
  publishedBy: string;
}

export type NewDomainEvent = Pick<DomainEvent, 'type' | 'workspaceId' | 'actorId'> &
  Partial<Pick<DomainEvent, 'projectId' | 'taskId' | 'memberId'>>;

export type EventHandler = (event: DomainEvent) => void;

const DEDUPE_WINDOW = 5000;
const eventSchema = z.object({
  id: z.uuid(), type: z.string().min(1).max(80), workspaceId: z.uuid(),
  projectId: z.uuid().nullable(), taskId: z.uuid().nullable(), actorId: z.uuid(),
  memberId: z.uuid().optional(), occurredAt: z.iso.datetime(), publishedBy: z.string().min(1).max(255),
});

/**
 * Redis Pub/Sub: one PUBLISH reaches every subscribed API instance (including the
 * publisher itself). That is how a change handled by instance A becomes visible to
 * instance B, which in Phase 4 pushes it to the browsers connected to B.
 *
 * Properties to keep in mind:
 * - Fire-and-forget, at-most-once. An instance that is down or disconnected misses
 *   events; there is no replay. Fine for "something changed, refresh" signals. Work
 *   that must not be lost (notifications, emails) goes to RabbitMQ in Phase 5.
 * - Duplicates are possible (e.g. a retried publish), so subscribers de-duplicate
 *   by event id.
 */
export function createEventBus(options: { publisher: Redis; subscriber: Redis; channel: string; instanceId: () => string }) {
  const handlers = new Set<EventHandler>();
  const seen = new Set<string>();

  function isDuplicate(id: string): boolean {
    if (seen.has(id)) return true;
    seen.add(id);
    if (seen.size > DEDUPE_WINDOW) seen.delete(seen.values().next().value!);
    return false;
  }

  function onMessage(channel: string, message: string) {
    if (channel !== options.channel) return;
    let event: DomainEvent;
    try {
      event = eventSchema.parse(JSON.parse(message));
    } catch {
      logger.warn({ channel }, 'Ignoring malformed event');
      return;
    }
    if (isDuplicate(event.id)) {
      metrics.eventsDuplicate += 1;
      return;
    }
    metrics.eventsReceived += 1;
    for (const handler of handlers) {
      try {
        handler(event);
      } catch (error) {
        logger.error({ err: error, eventType: event.type }, 'Event handler failed');
      }
    }
  }

  return {
    async start(): Promise<void> {
      options.subscriber.on('message', onMessage);
      await options.subscriber.subscribe(options.channel);
    },

    async stop(): Promise<void> {
      options.subscriber.off('message', onMessage);
      await options.subscriber.unsubscribe(options.channel).catch(() => undefined);
    },

    subscribe(handler: EventHandler): () => void {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },

    /** Never throws: the change is already committed; a lost event only delays other screens. */
    async publish(input: NewDomainEvent): Promise<DomainEvent> {
      const event: DomainEvent = {
        id: randomUUID(),
        projectId: null,
        taskId: null,
        ...input,
        occurredAt: new Date().toISOString(),
        publishedBy: options.instanceId(),
      };
      try {
        await options.publisher.publish(options.channel, JSON.stringify(event));
        metrics.eventsPublished += 1;
      } catch (error) {
        logger.warn({ err: error, eventType: event.type }, 'Could not publish event (Redis unavailable)');
      }
      return event;
    },
  };
}

export type EventBus = ReturnType<typeof createEventBus>;
