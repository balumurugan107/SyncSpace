import type { DomainEvent } from '../../infrastructure/events/event-bus.js';
import { instance } from '../../infrastructure/instance.js';

export interface ReceivedEvent extends DomainEvent {
  receivedBy: string;
  receivedAt: string;
}

const CAPACITY = 200;
const buffer: ReceivedEvent[] = [];

/**
 * Phase 3 consumer of the event bus: remembers the last events THIS instance
 * received, so System Health can show an event published by one instance arriving
 * at the others. (Phase 4 adds a second consumer that pushes them to browsers.)
 */
export function recordReceivedEvent(event: DomainEvent): void {
  buffer.unshift({ ...event, receivedBy: instance.id, receivedAt: new Date().toISOString() });
  if (buffer.length > CAPACITY) buffer.length = CAPACITY;
}

export function recentEvents(workspaceIds: Set<string>, limit: number): ReceivedEvent[] {
  return buffer.filter((event) => workspaceIds.has(event.workspaceId)).slice(0, limit);
}
