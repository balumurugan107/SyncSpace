import { Activity, CircleCheck, CircleX, Database, Network, RadioTower, RefreshCw, Server, Zap } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useBusEvents, useCluster, useHealth, type InstanceReport } from '@/lib/queries';
import { cn, formatDuration, formatRelative } from '@/lib/utils';

const COMPONENT_META: Record<string, { label: string; icon: ReactNode; description: string }> = {
  postgres: { label: 'PostgreSQL', icon: <Database />, description: 'Source of truth · critical: down means 503' },
  redis: { label: 'Redis', icon: <Zap />, description: 'Cache, rate limits, pub/sub · non-critical: the API degrades gracefully' },
};

function hitRatio(m: InstanceReport['metrics']): string {
  const total = m.cacheHits + m.cacheMisses;
  return total === 0 ? '–' : `${Math.round((m.cacheHits / total) * 100)}%`;
}

/** Fires real requests through the proxy and tallies the x-served-by header. */
function LoadBalancingDemo() {
  const [tally, setTally] = useState<Record<string, number> | null>(null);
  const [running, setRunning] = useState(false);
  async function run() {
    setRunning(true);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 12; i += 1) {
      const response = await fetch('/api/health/live', { cache: 'no-store' });
      const instance = response.headers.get('x-served-by') ?? 'unknown';
      counts[instance] = (counts[instance] ?? 0) + 1;
    }
    setTally(counts);
    setRunning(false);
  }
  return (
    <div className="rounded-xl border bg-muted/30 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">See load balancing happen</p>
          <p className="text-xs text-muted-foreground">Sends 12 requests through the web proxy and counts which instance answered each (the x-served-by header).</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void run()} disabled={running}>
          <Network /> {running ? 'Sending…' : 'Send 12 requests'}
        </Button>
      </div>
      {tally && (
        <div className="mt-3 space-y-1.5">
          {Object.entries(tally)
            .sort()
            .map(([instance, count]) => (
              <div key={instance} className="flex items-center gap-3 text-xs">
                <span className="w-36 truncate font-mono">{instance}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(count / 12) * 100}%` }} />
                </div>
                <span className="w-6 text-right tabular-nums">{count}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function ClusterCard() {
  const cluster = useCluster();
  const data = cluster.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>API instances</CardTitle>
        <CardDescription>
          Every instance writes a heartbeat to Redis every 5 s (expires after 15 s), so any instance can describe the whole cluster.
          {data && (
            <>
              {' '}This view was served by <span className="font-mono text-foreground">{data.servedBy}</span>.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data?.registry === 'unavailable' && (
          <Alert variant="destructive">
            <CircleX />
            <AlertDescription>Redis is unreachable, so only the serving instance is shown.</AlertDescription>
          </Alert>
        )}
        {!data ? (
          <Skeleton className="h-28" />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Instance</th>
                  <th className="px-3 py-2 font-medium">Uptime</th>
                  <th className="px-3 py-2 text-right font-medium">Requests</th>
                  <th className="px-3 py-2 text-right font-medium">Sockets</th>
                  <th className="px-3 py-2 text-right font-medium">Cache hit ratio</th>
                  <th className="px-3 py-2 text-right font-medium">Events pub / recv</th>
                  <th className="px-3 py-2 text-right font-medium">Rate-limited</th>
                  <th className="px-3 py-2 text-right font-medium">Memory</th>
                  <th className="px-3 py-2 font-medium">Heartbeat</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.instances.map((i) => (
                  <tr key={i.id} className={cn(i.id === data.servedBy && 'bg-primary/5')}>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2 font-mono text-xs">
                        <span className="size-2 rounded-full bg-success" />
                        {i.id}
                        {i.id === data.servedBy && <Badge variant="outline" className="font-sans text-[10px]">served this</Badge>}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">{formatDuration(i.uptimeSeconds)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{i.metrics.requests}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{i.metrics.sockets ?? 0}</td>
                    <td className="px-3 py-2 text-right tabular-nums" title={`${i.metrics.cacheHits} hits / ${i.metrics.cacheMisses} misses`}>
                      {hitRatio(i.metrics)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {i.metrics.eventsPublished} / {i.metrics.eventsReceived}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{i.metrics.rateLimited}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{i.memoryRssMb} MB</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{formatRelative(i.lastHeartbeatAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <LoadBalancingDemo />
      </CardContent>
    </Card>
  );
}

function EventBusCard() {
  const events = useBusEvents();
  const list = events.data?.events ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RadioTower className="size-4" /> Event bus (Redis Pub/Sub)
        </CardTitle>
        <CardDescription>
          After each committed change, the instance that handled it publishes an event; every instance receives it. Polling alternates between instances,
          so watch <span className="font-medium text-foreground">received by</span> change while <span className="font-medium text-foreground">published by</span> stays the same.
          Only events from your workspaces are shown.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {events.isPending ? (
          <Skeleton className="h-24" />
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events yet. Create or move a task on a board, then come back.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Event</th>
                  <th className="px-3 py-2 font-medium">Published by</th>
                  <th className="px-3 py-2 font-medium">Received by</th>
                  <th className="px-3 py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {list.slice(0, 12).map((e) => (
                  <tr key={`${e.id}-${e.receivedBy}`}>
                    <td className="px-3 py-2 font-mono text-xs">{e.type}</td>
                    <td className="px-3 py-2 font-mono text-xs">{e.publishedBy}</td>
                    <td className={cn('px-3 py-2 font-mono text-xs', e.receivedBy !== e.publishedBy && 'text-primary')}>{e.receivedBy}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{formatRelative(e.occurredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RedisStats() {
  const cluster = useCluster();
  const info = cluster.data?.redis;
  if (!info) return null;
  const hits = Number(info.keyspace_hits ?? 0);
  const misses = Number(info.keyspace_misses ?? 0);
  const items: [string, string][] = [
    ['Version', info.redis_version ?? '–'],
    ['Memory used', info.used_memory_human ?? '–'],
    ['Keys', info.keys ?? '–'],
    ['Connected clients', info.connected_clients ?? '–'],
    ['Commands processed', info.total_commands_processed ?? '–'],
    ['Keyspace hit ratio', hits + misses ? `${Math.round((hits / (hits + misses)) * 100)}%` : '–'],
  ];
  return (
    <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl border bg-muted/25 p-4">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SystemHealthPage() {
  const health = useHealth(5000);
  const report = health.data;

  return (
    <div className="page-content">
      <PageHeader
        eyebrow="Behind the scenes"
        title="System Health"
        description="A clear view of the services keeping your workspace connected."
        actions={
          <Button variant="outline" size="sm" onClick={() => void health.refetch()} disabled={health.isFetching}>
            <RefreshCw className={health.isFetching ? 'animate-spin' : ''} /> Refresh
          </Button>
        }
      />

      {health.isError && (
        <Alert variant="destructive">
          <CircleX />
          <AlertDescription>The API is unreachable: {health.error.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">{[{ label: 'API uptime', value: report ? formatDuration(report.uptimeSeconds) : '…', icon: Activity }, { label: 'Process memory', value: report ? `${report.memoryRssMb} MB` : '…', icon: Server }, { label: 'Environment', value: report?.environment ?? '…', icon: Database }].map(({ label, value, icon: Icon }) => <Card key={label} className="gap-3"><CardContent><div className="flex items-center justify-between text-xs text-muted-foreground">{label}<Icon className="size-4" /></div><p className="mt-4 text-2xl font-semibold tracking-tight tabular-nums">{value}</p></CardContent></Card>)}</div>
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="size-4" /> Dependencies
            </CardTitle>
            <CardDescription>
              Checked by <span className="font-mono">{report?.instance ?? '…'}</span> on GET /api/health/ready
            </CardDescription>
          </div>
          {report ? (
            report.status === 'ok' ? (
              <Badge variant="success">Operational</Badge>
            ) : report.status === 'degraded' ? (
              <Badge variant="warning">Degraded</Badge>
            ) : (
              <Badge variant="destructive">Down</Badge>
            )
          ) : (
            <Skeleton className="h-5 w-20" />
          )}
        </CardHeader>
        <CardContent>
          {report ? (
            <ul className="divide-y rounded-lg border">
              {Object.entries(report.components).map(([key, component]) => {
                const meta = COMPONENT_META[key] ?? { label: key, icon: <Server />, description: '' };
                return (
                  <li key={key} className="flex items-center gap-3 p-3">
                    <span className="text-muted-foreground [&_svg]:size-4">{meta.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{meta.label}</p>
                      <p className="truncate text-xs text-muted-foreground">{component.error ?? meta.description}</p>
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums">{component.latencyMs} ms</span>
                    {component.status === 'up' ? (
                      <CircleCheck className="size-4 text-success" aria-label="up" />
                    ) : (
                      <CircleX className="size-4 text-destructive" aria-label="down" />
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <Skeleton className="h-28" />
          )}
          <RedisStats />
        </CardContent>
      </Card>

      <ClusterCard />
      <EventBusCard />
      <p className="text-xs text-muted-foreground">
        RabbitMQ, MinIO and Elasticsearch appear here as they are added. Metrics and Grafana dashboards are planned for Phase 9.
      </p>
    </div>
  );
}
