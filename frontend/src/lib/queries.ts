import { useQuery } from '@tanstack/react-query';
import { api } from './api-client';

export interface SessionInfo {
  familyId: string;
  userAgent: string | null;
  ipAddress: string | null;
  signedInAt: string;
  lastActiveAt: string;
  expiresAt: string;
  current: boolean;
}

export interface HealthReport {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  environment: string;
  instance: string;
  startedAt: string;
  uptimeSeconds: number;
  memoryRssMb: number;
  components: Record<string, { status: 'up' | 'down'; critical: boolean; latencyMs: number; error?: string }>;
}

export interface InstanceReport {
  id: string;
  version: string;
  startedAt: string;
  uptimeSeconds: number;
  memoryRssMb: number;
  lastHeartbeatAt: string;
  metrics: {
    requests: number;
    sockets: number;
    cacheHits: number;
    cacheMisses: number;
    cacheErrors: number;
    rateLimited: number;
    eventsPublished: number;
    eventsReceived: number;
    eventsDuplicate: number;
  };
}

export interface ClusterReport {
  servedBy: string;
  registry: 'redis' | 'unavailable';
  instances: InstanceReport[];
  redis: Record<string, string> | null;
}

export interface BusEvent {
  id: string;
  type: string;
  workspaceId: string;
  projectId: string | null;
  taskId: string | null;
  actorId: string;
  occurredAt: string;
  publishedBy: string;
  receivedBy: string;
  receivedAt: string;
}

export const queryKeys = {
  sessions: ['auth', 'sessions'] as const,
  health: ['health', 'ready'] as const,
  cluster: ['system', 'instances'] as const,
  events: ['system', 'events'] as const,
};

export function useSessions() {
  return useQuery({
    queryKey: queryKeys.sessions,
    queryFn: () => api.get<{ sessions: SessionInfo[] }>('/auth/sessions').then((r) => r.sessions),
  });
}

/**
 * Readiness answers 503 with a full body when a dependency is down, so read the
 * body for both outcomes instead of treating 503 as an exception.
 */
async function fetchHealth(): Promise<HealthReport> {
  const response = await fetch('/api/health/ready');
  if (response.status !== 200 && response.status !== 503) {
    throw new Error(`API unreachable (HTTP ${response.status})`);
  }
  return (await response.json()) as HealthReport;
}

export function useHealth(refetchInterval = 5000) {
  return useQuery({ queryKey: queryKeys.health, queryFn: fetchHealth, refetchInterval, retry: false });
}

export function useCluster(refetchInterval = 3000) {
  return useQuery({ queryKey: queryKeys.cluster, queryFn: () => api.get<ClusterReport>('/system/instances'), refetchInterval });
}

export function useBusEvents(refetchInterval = 3000) {
  return useQuery({
    queryKey: queryKeys.events,
    queryFn: () => api.get<{ servedBy: string; events: BusEvent[] }>('/system/events'),
    refetchInterval,
  });
}
