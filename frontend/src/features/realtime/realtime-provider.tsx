import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth/auth-provider';
import { api, getAccessToken, refreshSession } from '@/lib/api-client';
import type { Workspace } from '@/features/work/types';
import { eventQueryKeys, rememberEvent, type WorkspaceEvent } from './realtime-logic';

interface RealtimeState {
  connected: boolean;
  online: Record<string, string[]>;
  typing: Record<string, { userId: string; until: number }[]>;
  socket: Socket | null;
  setDragging: (active: boolean) => void;
}
const RealtimeContext = createContext<RealtimeState>({ connected: false, online: {}, typing: {}, socket: null, setDragging: () => undefined });
export const useRealtime = () => useContext(RealtimeContext);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const userId = state.user?.id;
  const client = useQueryClient();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState<Record<string, string[]>>({});
  const [typing, setTyping] = useState<RealtimeState['typing']>({});
  const dragging = useRef(false);
  const pending = useRef(new Map<string, readonly unknown[]>());
  const flush = useCallback(() => {
    if (dragging.current) return;
    for (const queryKey of pending.current.values()) void client.invalidateQueries({ queryKey });
    pending.current.clear();
  }, [client]);
  const setDragging = useCallback((active: boolean) => { dragging.current = active; if (!active) flush(); }, [flush]);
  const workspaces = useQuery({
    queryKey: ['workspaces'], queryFn: () => api.get<{ workspaces: Workspace[] }>('/workspaces').then((r) => r.workspaces), enabled: Boolean(userId),
  });

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const seen = new Set<string>();
    const connection = io({
       path: '/api/socket.io', 
       transports: ['websocket'], 
       autoConnect: false,
       auth: (done) => done({ token: getAccessToken() }), 
       reconnectionDelay: 1000, 
       reconnectionDelayMax: 5000 
      });
    setSocket(connection);
    const connectWithFreshToken = async () => {
      try { if (await refreshSession()) { if (alive) connection.connect(); } }
      catch { if (alive) retry = setTimeout(() => void connectWithFreshToken(), 3000); }
    };
    connection.on('connect', () => {
      setConnected(true);
      void client.invalidateQueries(); // recover events missed while disconnected
    });
    connection.on('disconnect', (reason) => {
      setConnected(false); setOnline({});
      if (reason === 'io server disconnect') void connectWithFreshToken();
    });
    connection.on('connect_error', (error: Error & { data?: { code?: string } }) => {
      setConnected(false);
      if (error.data?.code === 'TOKEN_EXPIRED') void connectWithFreshToken();
      else if (!connection.active) retry = setTimeout(() => { if (alive) connection.connect(); }, 3000);
    });
    connection.on('realtime:resync', () => { setConnected(true); void client.invalidateQueries(); });
    connection.on('realtime:degraded', () => { setConnected(false); setOnline({}); });
    connection.on('workspace:membership', () => { void client.invalidateQueries(); });
    connection.on('workspace:revoked', ({ workspaceId }: { workspaceId: string }) => {
      // Remove old private data rather than keeping it visible after access is revoked.
      client.removeQueries({ predicate: (q) => q.queryKey.includes(workspaceId) });
      void client.invalidateQueries();
    });
    connection.on('presence', ({ workspaceId, userIds }: { workspaceId: string; userIds: string[] }) => {
      setOnline((current) => ({ ...current, [workspaceId]: userIds }));
    });
    connection.on('typing', ({ workspaceId, userId: author }: { workspaceId: string; userId: string }) => {
      setTyping((current) => ({ ...current, [workspaceId]: [...(current[workspaceId] ?? []).filter((v) => v.userId !== author), { userId: author, until: Date.now() + 3000 }] }));
    });
    connection.on('workspace:event', (event: WorkspaceEvent) => {
      if (!rememberEvent(seen, event.id)) return;
      for (const key of eventQueryKeys(event)) pending.current.set(JSON.stringify(key), key);
      if (event.actorId !== userId && (event.type.startsWith('task.') || event.type === 'chat.message')) {
        toast.info(event.type === 'chat.message' ? 'New workspace message' : 'A teammate updated a task', { id: event.id });
      }
    });
    const timer = setInterval(flush, 100);
    const typingTimer = setInterval(() => setTyping((current) => Object.fromEntries(Object.entries(current).map(([id, values]) => [id, values.filter((v) => v.until > Date.now())]))), 1000);
    connection.connect();
    return () => {
      alive = false; clearTimeout(retry); clearInterval(timer); clearInterval(typingTimer);
      connection.removeAllListeners(); connection.disconnect(); setSocket(null); setConnected(false); setOnline({}); setTyping({});
      pending.current.clear(); dragging.current = false;
    };
  }, [userId, client, flush]);

  const ids = (workspaces.data ?? []).map((w) => w.id).sort().join(',');
  useEffect(() => {
    if (!socket || !connected) return;
    const workspaceIds = ids ? ids.split(',') : [];
    for (const workspaceId of workspaceIds) socket.emit('workspace:join', { workspaceId }, (reply: { ok: boolean; data?: { userIds: string[] } }) => {
      if (reply.ok && reply.data) {
        setOnline((current) => ({ ...current, [workspaceId]: reply.data!.userIds }));
        // Read after subscribing: a change between the initial fetch and room join cannot be missed.
        for (const key of [['projects'], ['chat', workspaceId], ['workspaces', workspaceId], ['me']]) pending.current.set(JSON.stringify(key), key);
      }
    });
    return () => { for (const workspaceId of workspaceIds) socket.emit('workspace:leave', { workspaceId }, () => undefined); };
  }, [socket, connected, ids]);

  return <RealtimeContext.Provider value={{ connected, online, typing, socket, setDragging }}>{children}</RealtimeContext.Provider>;
}
