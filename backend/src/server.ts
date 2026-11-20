import { createServer } from 'node:http';
import { attachRealtime } from './infrastructure/realtime/realtime.js';
import { createApp } from './app.js';
import { config } from './config/env.js';
import { closePool } from './infrastructure/database/pool.js';
import { eventBus } from './infrastructure/events/index.js';
import { instance, resolveInstanceName } from './infrastructure/instance.js';
import { closeRedis } from './infrastructure/redis/redis.js';
import { recordReceivedEvent } from './modules/system/event-log.js';
import { startHeartbeat, stopHeartbeat } from './modules/system/instance-registry.js';
import { logger } from './infrastructure/logging/logger.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

await resolveInstanceName();

// Subscribe before accepting traffic, so this instance never misses events about
// changes it is about to serve. A Redis outage at boot must not block startup: the
// subscriber connection keeps retrying and subscribes once Redis is reachable.
eventBus.subscribe(recordReceivedEvent);
eventBus.start().catch((error: unknown) => logger.warn({ err: error }, 'Event bus subscription deferred'));
startHeartbeat();

const server = createServer(createApp());
const realtime = attachRealtime(server);

server.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV, instance: instance.id }, 'SyncSpace API listening');
});

/**
 * Graceful shutdown (docker stop sends SIGTERM):
 * 1. stop accepting new connections,
 * 2. let in-flight requests finish,
 * 3. close the database pool,
 * 4. exit. If that takes longer than the timeout, force-exit.
 */
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down gracefully');

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out; forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  await realtime.close(); // closes upgraded sockets, then drains/closes the HTTP server
  await stopHeartbeat();
  await eventBus.stop();
  await closeRedis();
  await closePool().catch((err: unknown) => logger.error({ err }, 'Error closing database pool'));
  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});
