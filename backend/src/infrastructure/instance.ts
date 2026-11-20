import { resolve } from 'node:dns/promises';
import { hostname, networkInterfaces } from 'node:os';
import { config } from '../config/env.js';

/**
 * Identity and live counters of THIS API process. Shown in System Health and in the
 * `x-served-by` response header, so you can see load balancing happen.
 */
export const instance = {
  id: config.INSTANCE_ID ?? hostname(),
  startedAt: new Date(),
};

export const metrics = {
  requests: 0,
  sockets: 0,
  cacheHits: 0,
  cacheMisses: 0,
  cacheErrors: 0,
  rateLimited: 0,
  eventsPublished: 0,
  eventsReceived: 0,
  eventsDuplicate: 0,
};

/**
 * Inside Docker the hostname is a random container id. Docker's DNS can map our IP
 * back to the container name (e.g. "syncspace-api-2"), which is much easier to read.
 */
export async function resolveInstanceName(): Promise<void> {
  if (config.INSTANCE_ID) return;
  const ip = Object.values(networkInterfaces())
    .flat()
    .find((nic) => nic && nic.family === 'IPv4' && !nic.internal)?.address;
  if (!ip) return;
  try {
    // An explicit PTR query: dns.reverse() returns [] for Docker's embedded DNS answers.
    const arpa = `${ip.split('.').reverse().join('.')}.in-addr.arpa`;
    const [name] = await resolve(arpa, 'PTR');
    if (name) instance.id = name.split('.')[0]!;
  } catch {
    /* keep the hostname */
  }
}
