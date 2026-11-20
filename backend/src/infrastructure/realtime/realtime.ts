import type { Server as HttpServer } from 'node:http';
import type { Redis } from 'ioredis';
import { decodeJwt } from 'jose';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';
import { config } from '../../config/env.js';
import { pool } from '../database/pool.js';
import { eventBus } from '../events/index.js';
import type { DomainEvent, EventBus } from '../events/event-bus.js';
import { instance, metrics } from '../instance.js';
import { logger } from '../logging/logger.js';
import { redis, redisSubscriber } from '../redis/redis.js';
import { verifyAccessToken } from '../../modules/auth/token.service.js';
import { chatService, sendMessageSchema } from '../../modules/chat/chat.service.js';
import { requireWorkspaceRole } from '../../modules/workspaces/workspace-access.js';
import { AppError } from '../../shared/errors/app-error.js';
import { createPresence } from './presence.js';

const workspaceInput = z.object({ workspaceId: z.uuid() });
const chatInput = sendMessageSchema.extend({ workspaceId: z.uuid() });
type Ack = (result: { ok: boolean; data?: unknown; error?: { code: string; message: string } }) => void;
const room = (workspaceId: string) => `workspace:${workspaceId}`;
const limitScript = `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return n`;

/** Domain events already fan out through Redis. Only emit locally here; no second adapter fan-out. */
export function attachRealtime(server: HttpServer, options: { bus?: EventBus; client?: Redis; subscriber?: Redis } = {}) {
  const bus = options.bus ?? eventBus;
  const client = options.client ?? redis;
  const subscriber = options.subscriber ?? redisSubscriber;
  const online = createPresence(client);
  const io = new Server(server, {
    path: '/api/socket.io', transports: ['websocket'], maxHttpBufferSize: 16_384,
    cors: { origin: config.CORS_ORIGINS, credentials: true },
    // CORS alone does not protect WebSocket handshakes. Non-browser clients have no Origin.
    allowRequest: (req, done) => done(null, !req.headers.origin || config.CORS_ORIGINS.includes(req.headers.origin)),
  });
  const joined = new Map<string, Set<string>>();
  let stopping = false;
  async function limited(key: string, max = 240, window = 10_000) {
    const count = Number(await client.eval(limitScript, 1, `rl:socket:${key}:${Math.floor(Date.now() / window)}`, window));
    if (count > max) throw new AppError(429, 'RATE_LIMITED', 'Too many real-time requests. Try again shortly.');
  }
  io.use(async (socket, next) => {
    try {
      const token = z.string().min(1).max(4096).parse(socket.handshake.auth.token);
      const user = await verifyAccessToken(token);
      await limited(`connect:${user.id}`, 30, 60_000);
      socket.data.userId = user.id;
      socket.data.token = token;
      socket.data.expiresAt = decodeJwt(token).exp! * 1000;
      next();
    } catch (error) {
      const failure = new Error(error instanceof AppError ? error.message : 'Real-time connection unavailable');
      Object.assign(failure, { data: { code: error instanceof AppError ? error.code : 'REALTIME_UNAVAILABLE' } });
      next(failure);
    }
  });

  async function announce(workspaceId: string, actorId: string, type = 'presence.changed') {
    await bus.publish({ type, workspaceId, actorId });
  }
  async function leave(socket: Socket, workspaceId: string) {
    joined.get(socket.id)?.delete(workspaceId);
    await socket.leave(room(workspaceId));
    await online.remove(workspaceId, socket.data.userId, socket.id).catch(() => undefined);
  }
  // One membership query per affected workspace per event, rather than one per connected browser.
  async function authorizedSockets(workspaceId: string) {
    const sockets = [...io.sockets.sockets.values()].filter((s) => joined.get(s.id)?.has(workspaceId));
    if (!sockets.length) return [];
    const { rows } = await pool.query<{ userId: string }>('SELECT user_id AS "userId" FROM workspace_members WHERE workspace_id=$1', [workspaceId]);
    const members = new Set(rows.map((r) => r.userId));
    const allowed: Socket[] = [];
    for (const socket of sockets) {
      if (members.has(socket.data.userId) && socket.data.expiresAt > Date.now()) allowed.push(socket);
      else {
        await leave(socket, workspaceId);
        socket.emit('workspace:revoked', { workspaceId });
      }
    }
    return allowed;
  }
  async function deliver(event: DomainEvent) {
    if (event.memberId) io.local.to(`user:${event.memberId}`).emit('workspace:membership', { workspaceId: event.workspaceId });
    const sockets = await authorizedSockets(event.workspaceId);
    if (event.type === 'presence.changed') {
      const userIds = await online.list(event.workspaceId);
      for (const socket of sockets) socket.emit('presence', { workspaceId: event.workspaceId, userIds });
    } else if (event.type === 'chat.typing') {
      for (const socket of sockets) if (socket.data.userId !== event.actorId) socket.emit('typing', { workspaceId: event.workspaceId, userId: event.actorId });
    } else {
      for (const socket of sockets) socket.emit('workspace:event', event);
    }
  }
  // Preserve publication order even though live membership checks are asynchronous.
  let deliveries = Promise.resolve();
  const unsubscribe = bus.subscribe((event) => {
    deliveries = deliveries.then(() => stopping ? undefined : deliver(event)).catch((err: unknown) => {
      logger.warn({ err }, 'Real-time event delivery skipped');
    });
  });

  io.on('connection', (socket) => {
    joined.set(socket.id, new Set());
    metrics.sockets += 1;
    void socket.join(`user:${socket.data.userId}`);
    socket.emit('realtime:ready', { instanceId: instance.id });
    const expiry = setTimeout(() => {
      socket.emit('auth:expired');
      socket.disconnect(true);
    }, Math.max(0, socket.data.expiresAt - Date.now()));
    expiry.unref();

    function handle(name: string, action: (value: unknown) => Promise<unknown>) {
      socket.on(name, (value: unknown, ack?: Ack) => {
        if (typeof ack !== 'function') return;
        void (async () => {
          try {
            await verifyAccessToken(socket.data.token);
            await limited(socket.data.userId);
            const data = await action(value);
            ack({ ok: true, data });
          } catch (error) {
            ack({ ok: false, error: { code: error instanceof AppError ? error.code : error instanceof z.ZodError ? 'VALIDATION_ERROR' : 'REALTIME_UNAVAILABLE',
              message: error instanceof AppError ? error.message : error instanceof z.ZodError ? 'Invalid request' : 'Real-time request failed' } });
          }
        })();
      });
    }
    handle('workspace:join', async (value) => {
      const { workspaceId } = workspaceInput.parse(value);
      await requireWorkspaceRole(workspaceId, socket.data.userId);
      if (!socket.connected) throw new Error('Disconnected');
      const rooms = joined.get(socket.id)!;
      if (rooms.size >= 100 && !rooms.has(workspaceId)) throw new AppError(429, 'ROOM_LIMIT', 'Too many open workspaces');
      await online.touch(workspaceId, socket.data.userId, socket.id);
      await socket.join(room(workspaceId));
      rooms.add(workspaceId);
      await announce(workspaceId, socket.data.userId);
      return { userIds: await online.list(workspaceId) };
    });
    handle('workspace:leave', async (value) => {
      const { workspaceId } = workspaceInput.parse(value);
      await leave(socket, workspaceId);
      await announce(workspaceId, socket.data.userId);
    });
    handle('chat:send', async (value) => {
      const { workspaceId, ...input } = chatInput.parse(value);
      return chatService.send(workspaceId, socket.data.userId, input);
    });
    handle('chat:typing', async (value) => {
      const { workspaceId } = workspaceInput.parse(value);
      await requireWorkspaceRole(workspaceId, socket.data.userId);
      await limited(`typing:${socket.data.userId}`, 1, 2000);
      await announce(workspaceId, socket.data.userId, 'chat.typing');
    });
    socket.on('disconnect', () => {
      clearTimeout(expiry);
      metrics.sockets -= 1;
      const rooms = [...(joined.get(socket.id) ?? [])];
      joined.delete(socket.id);
      void Promise.all(rooms.map(async (workspaceId) => {
        await online.remove(workspaceId, socket.data.userId, socket.id).catch(() => undefined);
        await announce(workspaceId, socket.data.userId);
      }));
    });
  });

  let beating = false;
  async function beat() {
    if (beating || stopping) return;
    beating = true;
    try {
      const workspaces = new Set([...joined.values()].flatMap((rooms) => [...rooms]));
      for (const workspaceId of workspaces) {
        const sockets = await authorizedSockets(workspaceId);
        for (const socket of sockets) await online.touch(workspaceId, socket.data.userId, socket.id);
        // Also broadcasts expiry of crashed instances, even if no new users join.
        if (sockets[0]) await announce(workspaceId, sockets[0].data.userId);
      }
    } catch (err) { logger.debug({ err }, 'Presence heartbeat skipped'); }
    finally { beating = false; }
  }
  const timer = setInterval(() => void beat(), 15_000);
  timer.unref();
  // After Redis reconnect, missed messages must be fetched from PostgreSQL.
  const resync = () => { io.local.emit('realtime:resync'); void beat(); };
  const degraded = () => io.local.emit('realtime:degraded');
  subscriber.on('ready', resync);
  subscriber.on('close', degraded);
  return {
    io,
    async close() {
      stopping = true;
      clearInterval(timer);
      unsubscribe();
      subscriber.off('ready', resync);
      subscriber.off('close', degraded);
      // Disconnect handlers remove presence before closing Redis.
      const removals = [...io.sockets.sockets.values()].flatMap((s) => [...(joined.get(s.id) ?? [])].map((w) => online.remove(w, s.data.userId, s.id).catch(() => undefined)));
      await Promise.all(removals);
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await deliveries;
    },
  };
}
