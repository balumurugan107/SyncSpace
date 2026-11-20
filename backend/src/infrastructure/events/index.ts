import { config } from '../../config/env.js';
import { instance } from '../instance.js';
import { redis, redisSubscriber } from '../redis/redis.js';
import { createEventBus } from './event-bus.js';

export const eventBus = createEventBus({
  publisher: redis,
  subscriber: redisSubscriber,
  channel: config.EVENTS_CHANNEL,
  instanceId: () => instance.id,
});
