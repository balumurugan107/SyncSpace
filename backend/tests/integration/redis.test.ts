import express from 'express';
import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../../src/config/env.js';
import { createCache } from '../../src/infrastructure/cache/cache.js';
import { createEventBus, type DomainEvent } from '../../src/infrastructure/events/event-bus.js';
import { eventBus } from '../../src/infrastructure/events/index.js';
import { rateLimit } from '../../src/infrastructure/rate-limit/rate-limit.js';
import { redis } from '../../src/infrastructure/redis/redis.js';
import { recordReceivedEvent } from '../../src/modules/system/event-log.js';
import { startHeartbeat, stopHeartbeat } from '../../src/modules/system/instance-registry.js';
import {
  addMember,
  app,
  as,
  closeConnections,
  createProject,
  createWorkspace,
  migrateTestDatabase,
  registerUser,
  resetDatabase,
} from './helpers.js';

/** A client pointed at a port where nothing listens: every command fails immediately. */
function deadRedis(): Redis {
  return new Redis('redis://127.0.0.1:1', {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
}

const extraClients: Redis[] = [];
function newClient(): Redis {
  const client = new Redis(config.REDIS_URL);
  extraClients.push(client);
  return client;
}

beforeAll(migrateTestDatabase);
beforeEach(resetDatabase);
afterAll(async () => {
  await Promise.all(extraClients.map((c) => c.quit().catch(() => undefined)));
  await closeConnections();
});

describe('generation-based cache', () => {
  const cache = createCache(redis, 60);

  it('misses, then hits without calling the loader again', async () => {
    let loads = 0;
    const load = async () => ({ n: ++loads });
    expect(await cache.read('demo', ['project:p1'], load)).toEqual({ value: { n: 1 }, status: 'MISS' });
    await new Promise((r) => setTimeout(r, 20)); // SET happens in the background
    expect(await cache.read('demo', ['project:p1'], load)).toEqual({ value: { n: 1 }, status: 'HIT' });
    expect(loads).toBe(1);
  });

  it('invalidating a scope forces a reload; other scopes are untouched', async () => {
    await cache.read('a', ['project:p1'], async () => 'a1');
    await cache.read('b', ['project:p2'], async () => 'b1');
    await new Promise((r) => setTimeout(r, 20));
    await cache.invalidate(['project:p1']);
    expect(await cache.read('a', ['project:p1'], async () => 'a2')).toEqual({ value: 'a2', status: 'MISS' });
    expect(await cache.read('b', ['project:p2'], async () => 'b2')).toEqual({ value: 'b1', status: 'HIT' });
  });

  it('a reader that loaded stale data before an invalidation cannot poison the cache', async () => {
    // The loader simulates a slow reader: while it holds the OLD value, a writer
    // commits and invalidates. The reader then stores 'stale' under the old generation.
    await cache.read('race', ['project:p1'], async () => {
      await cache.invalidate(['project:p1']);
      return 'stale';
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(await cache.read('race', ['project:p1'], async () => 'fresh')).toEqual({ value: 'fresh', status: 'MISS' });
  });

  it('falls back to the loader when Redis is down (BYPASS), never failing the read', async () => {
    const broken = createCache(deadRedis(), 60);
    expect(await broken.read('x', ['users'], async () => 42)).toEqual({ value: 42, status: 'BYPASS' });
    await expect(broken.invalidate(['users'])).resolves.toBeUndefined();
  });
});

describe('HTTP caching', () => {
  async function setup() {
    const owner = await registerUser();
    const member = await registerUser();
    const ws = await createWorkspace(owner);
    const project = await createProject(owner, ws.id, 'WEB');
    await addMember(owner, ws.id, member);
    return { owner, member, ws, project };
  }
  const settle = () => new Promise((r) => setTimeout(r, 30));

  it('serves the board from cache and reloads after every kind of task write', async () => {
    const { owner, project } = await setup();
    const board = () => as(owner).get(`/api/projects/${project.id}/tasks`);

    expect((await board()).headers['x-cache']).toBe('MISS');
    await settle();
    expect((await board()).headers['x-cache']).toBe('HIT');

    const created = await as(owner).post(`/api/projects/${project.id}/tasks`, { title: 'Cached?' }).expect(201);
    const afterCreate = await board();
    expect(afterCreate.headers['x-cache']).toBe('MISS');
    expect(afterCreate.body.tasks.map((t: { title: string }) => t.title)).toEqual(['Cached?']);
    await settle();

    await as(owner).post(`/api/tasks/${created.body.task.id}/move`, { status: 'COMPLETED', afterTaskId: null }).expect(200);
    const afterMove = await board();
    expect(afterMove.headers['x-cache']).toBe('MISS');
    expect(afterMove.body.tasks[0].status).toBe('COMPLETED');
    await settle();

    await as(owner).patch(`/api/tasks/${created.body.task.id}`, { title: 'Renamed' }).expect(200);
    expect((await board()).body.tasks[0].title).toBe('Renamed');
    await settle();

    await as(owner).delete(`/api/tasks/${created.body.task.id}`).expect(204);
    expect((await board()).body.tasks).toEqual([]);
  });

  it('renaming a project refreshes its cached header and board', async () => {
    const { owner, project } = await setup();
    await as(owner).post(`/api/projects/${project.id}/tasks`, { title: 'T' }).expect(201);
    await as(owner).get(`/api/projects/${project.id}`);
    await as(owner).get(`/api/projects/${project.id}/tasks`);
    await settle();
    expect((await as(owner).get(`/api/projects/${project.id}`)).headers['x-cache']).toBe('HIT');

    await as(owner).patch(`/api/projects/${project.id}`, { name: 'Renamed project' }).expect(200);
    const header = await as(owner).get(`/api/projects/${project.id}`);
    expect(header.headers['x-cache']).toBe('MISS');
    expect(header.body.project.name).toBe('Renamed project');
    expect((await as(owner).get(`/api/projects/${project.id}/tasks`)).body.tasks[0].projectName).toBe('Renamed project');
  });

  it('member changes and display-name changes refresh cached member lists and boards', async () => {
    const { owner, member, ws, project } = await setup();
    await as(owner).post(`/api/projects/${project.id}/tasks`, { title: 'T', assigneeId: member.user.id }).expect(201);
    await as(owner).get(`/api/workspaces/${ws.id}/members`);
    await as(owner).get(`/api/projects/${project.id}/tasks`);
    await settle();
    expect((await as(owner).get(`/api/workspaces/${ws.id}/members`)).headers['x-cache']).toBe('HIT');

    await as(member).patch('/api/users/me', { displayName: 'New Name' }).expect(200);
    const members = await as(owner).get(`/api/workspaces/${ws.id}/members`);
    expect(members.headers['x-cache']).toBe('MISS');
    expect(members.body.members.map((m: { displayName: string }) => m.displayName)).toContain('New Name');
    expect((await as(owner).get(`/api/projects/${project.id}/tasks`)).body.tasks[0].assignee.displayName).toBe('New Name');
    await settle();

    await as(owner).delete(`/api/workspaces/${ws.id}/members/${member.user.id}`).expect(204);
    expect((await as(owner).get(`/api/projects/${project.id}/tasks`)).body.tasks[0].assignee).toBeNull();
  });

  it('never caches permissions: a removed member loses access even while the board is cached', async () => {
    const { owner, member, ws, project } = await setup();
    await as(member).get(`/api/projects/${project.id}/tasks`).expect(200);
    await settle();
    expect((await as(member).get(`/api/projects/${project.id}/tasks`)).headers['x-cache']).toBe('HIT');

    await as(owner).delete(`/api/workspaces/${ws.id}/members/${member.user.id}`).expect(204);
    await as(member).get(`/api/projects/${project.id}/tasks`).expect(404);
    await as(member).get(`/api/projects/${project.id}`).expect(404);
  });

  it('merges the caller’s live role into a cached project', async () => {
    const { owner, member, project } = await setup();
    await as(owner).get(`/api/projects/${project.id}`);
    await settle();
    const asMember = await as(member).get(`/api/projects/${project.id}`);
    expect(asMember.headers['x-cache']).toBe('HIT');
    expect(asMember.body.project.role).toBe('member');
  });
});

describe('distributed rate limiting', () => {
  function instanceApp(client: Redis, name: string) {
    const instance = express();
    instance.set('trust proxy', 1);
    instance.use(rateLimit({ name, limit: 3, windowMs: 60_000, redis: client }));
    instance.get('/', (_req, res) => res.json({ ok: true }));
    return instance;
  }

  it('shares one budget across instances because the counter lives in Redis', async () => {
    const name = `test-${Date.now()}`;
    const a = instanceApp(newClient(), name);
    const b = instanceApp(newClient(), name);
    const ip = { 'X-Forwarded-For': '203.0.113.7' };

    await request(a).get('/').set(ip).expect(200);
    await request(b).get('/').set(ip).expect(200);
    const third = await request(a).get('/').set(ip).expect(200);
    expect(third.headers['ratelimit-remaining']).toBe('0');

    const blocked = await request(b).get('/').set(ip).expect(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);

    // A different client has its own budget.
    await request(b).get('/').set({ 'X-Forwarded-For': '198.51.100.1' }).expect(200);
  });

  it('fails open when Redis is unavailable', async () => {
    const broken = instanceApp(deadRedis(), 'broken');
    for (let i = 0; i < 5; i += 1) await request(broken).get('/').expect(200);
  });
});

describe('event bus (Redis Pub/Sub)', () => {
  const channel = `syncspace:test:bus:${Date.now()}`;

  function instanceBus(id: string) {
    const received: DomainEvent[] = [];
    const bus = createEventBus({ publisher: newClient(), subscriber: newClient(), channel, instanceId: () => id });
    bus.subscribe((event) => received.push(event));
    return { bus, received };
  }

  it('delivers an event published by one instance to every instance, once', async () => {
    const a = instanceBus('api-a');
    const b = instanceBus('api-b');
    await Promise.all([a.bus.start(), b.bus.start()]);

    const event = await a.bus.publish({ type: 'task.moved', workspaceId: randomUUID(), projectId: randomUUID(), taskId: randomUUID(), actorId: randomUUID() });
    // Re-deliver the exact same message (as a retried publish would): must be ignored.
    await newClient().publish(channel, JSON.stringify(event));
    await new Promise((r) => setTimeout(r, 150));

    for (const instance of [a, b]) {
      expect(instance.received).toHaveLength(1);
      expect(instance.received[0]).toMatchObject({ id: event.id, type: 'task.moved', publishedBy: 'api-a' });
    }
    await Promise.all([a.bus.stop(), b.bus.stop()]);
  });

  it('publishing never throws when Redis is down', async () => {
    const bus = createEventBus({ publisher: deadRedis(), subscriber: deadRedis(), channel, instanceId: () => 'x' });
    await expect(bus.publish({ type: 't', workspaceId: 'w', actorId: 'u' })).resolves.toMatchObject({ type: 't' });
  });

  describe('through the API', () => {
    let unsubscribe: () => void;
    beforeAll(async () => {
      unsubscribe = eventBus.subscribe(recordReceivedEvent);
      await eventBus.start();
    });
    afterAll(async () => {
      unsubscribe();
      await eventBus.stop();
    });

    it('publishes after commit and shows events only to workspace members', async () => {
      const owner = await registerUser();
      const outsider = await registerUser();
      const ws = await createWorkspace(owner);
      const project = await createProject(owner, ws.id);
      const task = await as(owner).post(`/api/projects/${project.id}/tasks`, { title: 'Evented' }).expect(201);
      await as(owner).post(`/api/tasks/${task.body.task.id}/move`, { status: 'IN_PROGRESS', afterTaskId: null }).expect(200);
      await new Promise((r) => setTimeout(r, 150));

      const mine = await as(owner).get('/api/system/events').expect(200);
      const types = mine.body.events.filter((e: DomainEvent) => e.workspaceId === ws.id).map((e: DomainEvent) => e.type);
      expect(types.slice(0, 3)).toEqual(['task.moved', 'task.created', 'project.created']);
      expect(mine.body.events[0]).toMatchObject({ publishedBy: 'test-instance', receivedBy: 'test-instance', taskId: task.body.task.id });

      const theirs = await as(outsider).get('/api/system/events').expect(200);
      expect(theirs.body.events.filter((e: DomainEvent) => e.workspaceId === ws.id)).toEqual([]);
    });

    it('does not publish when a write fails', async () => {
      const owner = await registerUser();
      const ws = await createWorkspace(owner);
      const project = await createProject(owner, ws.id);
      const before = (await as(owner).get('/api/system/events')).body.events.length;
      await as(owner).post(`/api/projects/${project.id}/tasks`, { title: '' }).expect(400);
      await new Promise((r) => setTimeout(r, 100));
      expect((await as(owner).get('/api/system/events')).body.events.length).toBe(before);
    });
  });
});

describe('cluster visibility', () => {
  afterEach(() => stopHeartbeat());

  it('lists live instances from the heartbeat registry', async () => {
    const user = await registerUser();
    await request(app).get('/api/system/instances').expect(401);
    startHeartbeat();
    await new Promise((r) => setTimeout(r, 100));
    const res = await as(user).get('/api/system/instances').expect(200);
    expect(res.body.servedBy).toBe('test-instance');
    expect(res.body.instances.map((i: { id: string }) => i.id)).toEqual(['test-instance']);
    expect(res.body.instances[0].metrics).toHaveProperty('cacheHits');
    expect(res.body.redis.redis_version).toMatch(/^7\./);
  });

  it('readiness reports Redis as a non-critical dependency and every response names its instance', async () => {
    const res = await request(app).get('/api/health/ready').expect(200);
    expect(res.headers['x-served-by']).toBe('test-instance');
    expect(res.body.components.redis).toMatchObject({ status: 'up', critical: false });
    expect(res.body.components.postgres).toMatchObject({ status: 'up', critical: true });
  });
});
