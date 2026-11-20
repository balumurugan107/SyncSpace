import { useRealtime } from './realtime-provider';
export function PresenceBadge({ workspaceId }: { workspaceId: string }) {
  const { connected, online } = useRealtime();
  return <span className="inline-flex items-center gap-2 text-xs text-muted-foreground" role="status">
    <span className={`size-2 rounded-full ${connected ? 'bg-success' : 'bg-warning'}`} />
    {connected ? `${online[workspaceId]?.length ?? 0} online · Live` : 'Reconnecting · changes sync when connected'}
  </span>;
}
