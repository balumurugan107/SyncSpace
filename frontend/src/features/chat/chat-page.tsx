import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ChevronRight, Loader2, MessageCircle, MessageSquare, Send, Users } from 'lucide-react';
import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/layout/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/features/auth/auth-provider';
import { PresenceBadge } from '@/features/realtime/presence-badge';
import { useRealtime } from '@/features/realtime/realtime-provider';
import { errorMessage, useMembers, useWorkspaces } from '@/features/work/api';
import { UserAvatar } from '@/features/work/task-meta';
import type { Workspace } from '@/features/work/types';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface Message { id: string; authorId: string | null; authorName: string; body: string; createdAt: string; clientId: string }
interface History { messages: Message[]; nextCursor: string | null }

function dayLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

export function ChatPage() {
  const workspaces = useWorkspaces();
  const [params, setParams] = useSearchParams();
  const workspace = workspaces.data?.find((item) => item.id === params.get('workspace')) ?? workspaces.data?.[0];
  const selectWorkspace = (id: string) => setParams((current) => {
    const next = new URLSearchParams(current);
    next.set('workspace', id);
    return next;
  });

  return (
    <div className="page-content">
      <PageHeader eyebrow="Conversations that connect" title="Team Chat" description="Updates, questions and conversations with your workspace." />
      {workspaces.isPending ? (
        <Skeleton className="h-[65svh] rounded-2xl" />
      ) : workspaces.isError ? (
        <Alert variant="destructive"><AlertDescription>{errorMessage(workspaces.error)}</AlertDescription></Alert>
      ) : !workspace ? (
        <Card><CardContent className="flex flex-col items-center px-6 py-20 text-center">
          <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><MessageCircle className="size-8" aria-hidden="true" /></div>
          <h2 className="text-lg font-semibold">A space for your team</h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Create or join a workspace to start sharing messages with your teammates.</p>
          <Button asChild className="mt-6"><Link to="/workspaces">View workspaces <ChevronRight aria-hidden="true" /></Link></Button>
        </CardContent></Card>
      ) : (
        <div className="grid min-w-0 overflow-hidden rounded-2xl border bg-card shadow-[0_4px_20px_-12px_rgb(15_23_42_/_0.15)] md:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[248px_minmax(0,1fr)]">
          <div className="border-b p-4 md:hidden">
            <label htmlFor="chat-workspace" className="mb-2 block text-xs font-medium text-muted-foreground">Workspace</label>
            <select id="chat-workspace" className="h-11 w-full min-w-0 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Chat workspace" value={workspace.id} onChange={(event) => selectWorkspace(event.target.value)}>
              {workspaces.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <ChatSidebar workspaces={workspaces.data ?? []} workspace={workspace} onSelect={selectWorkspace} />
          <WorkspaceChat key={workspace.id} workspace={workspace} />
        </div>
      )}
    </div>
  );
}

function ChatSidebar({ workspaces, workspace, onSelect }: { workspaces: Workspace[]; workspace: Workspace; onSelect: (id: string) => void }) {
  const members = useMembers(workspace.id);
  const { connected, online } = useRealtime();
  const me = useCurrentUser();
  const onlineIds = connected ? online[workspace.id] ?? [] : [];

  return (
    <aside className="hidden min-h-0 flex-col border-r bg-muted/35 md:flex" aria-label="Chat navigation">
      <div className="flex items-center gap-3 border-b px-5 py-5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><MessageSquare className="size-5" aria-hidden="true" /></div>
        <div><p className="text-sm font-semibold">Conversations</p><p className="mt-0.5 text-xs text-muted-foreground">Your team's shared space</p></div>
      </div>
      <div className="max-h-60 overflow-y-auto p-3">
        <p className="mb-2 px-2 pt-2 text-xs font-medium text-muted-foreground">Workspaces <span className="ml-1 tabular-nums">{workspaces.length}</span></p>
        <nav className="space-y-1" aria-label="Workspace conversations">
          {workspaces.map((item) => (
            <button key={item.id} type="button" aria-current={item.id === workspace.id ? 'page' : undefined} onClick={() => onSelect(item.id)} className={cn('flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', item.id === workspace.id ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
              <MessageCircle className="size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{item.name}</span>
              {item.id === workspace.id && <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />}
            </button>
          ))}
        </nav>
      </div>
      <div className="mx-5 border-t" />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground"><p className="font-medium">Workspace members</p><Users className="size-3.5" aria-hidden="true" /></div>
        {members.isPending ? <Skeleton className="h-24" /> : members.isError ? <p className="text-xs text-destructive">Could not load members.</p> : (
          <ul className="space-y-4">
            {members.data?.map((member) => (
              <li key={member.userId} className="flex items-center gap-2.5">
                <div className="relative shrink-0"><UserAvatar name={member.displayName} className="size-8" />
                  {onlineIds.includes(member.userId) && <span className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-card bg-success" aria-label="Online" />}
                </div>
                <div className="min-w-0"><p className="truncate text-xs font-medium" title={member.displayName}>{member.displayName}{member.userId === me.id && <span className="font-normal text-muted-foreground"> (you)</span>}</p><p className="mt-0.5 text-[11px] capitalize text-muted-foreground">{member.role}</p></div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t px-5 py-4"><Link to={`/workspaces/${workspace.id}`} className="flex min-h-8 items-center justify-between text-xs text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">View workspace <ChevronRight className="size-3.5" aria-hidden="true" /></Link></div>
    </aside>
  );
}

function WorkspaceChat({ workspace }: { workspace: Workspace }) {
  const workspaceId = workspace.id;
  const me = useCurrentUser();
  const client = useQueryClient();
  const { socket, typing } = useRealtime();
  const members = useMembers(workspaceId);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  // Preserve this ID after a network error: retrying cannot create a duplicate message.
  const retry = useRef<{ body: string; clientId: string } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const lastTyping = useRef(0);
  const history = useInfiniteQuery({
    queryKey: ['chat', workspaceId], initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.get<History>(`/chat/${workspaceId}/messages${pageParam ? `?before=${pageParam}` : ''}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const messages = [...new Map((history.data?.pages.flatMap((page) => page.messages) ?? []).map((message) => [message.id, message])).values()]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const newest = messages.at(-1)?.id;
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
  }, [newest]);
  const typists = (typing[workspaceId] ?? []).filter((value) => value.userId !== me.id)
    .map((value) => members.data?.find((member) => member.userId === value.userId)?.displayName ?? 'A teammate');

  async function send(event: FormEvent) {
    event.preventDefault();
    const content = body.trim();
    if (!content || sending) return;
    const input = retry.current?.body === content ? retry.current : { body: content, clientId: crypto.randomUUID() };
    retry.current = input; setSending(true); setError('');
    try {
      // HTTP also works during socket interruption; delivery still uses post-commit Pub/Sub.
      await api.post(`/chat/${workspaceId}/messages`, input);
      retry.current = null; setBody('');
      await client.invalidateQueries({ queryKey: ['chat', workspaceId] });
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setSending(false); }
  }

  return (
    <section className="flex h-[min(72svh,760px)] min-h-[540px] min-w-0 flex-col md:min-h-[620px]" aria-label={`${workspace.name} conversation`}>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-background text-primary"><MessageSquare className="size-5" aria-hidden="true" /></div>
          <div className="min-w-0"><h2 className="break-words text-base font-semibold tracking-tight [overflow-wrap:anywhere]">{workspace.name}</h2><p className="mt-0.5 text-xs text-muted-foreground">Workspace conversation</p></div>
        </div>
        <PresenceBadge workspaceId={workspaceId} />
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-background/60 px-4 py-5 sm:px-7" aria-label="Workspace messages">
        {history.hasNextPage && <Button className="mb-5 min-h-11 shrink-0 self-center rounded-full text-xs" variant="outline" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>{history.isFetchingNextPage ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ArrowUp className="size-3.5" aria-hidden="true" />}Load older messages</Button>}
        {history.isPending ? (
          <div className="space-y-6" aria-label="Loading messages"><Skeleton className="h-16 w-3/4 rounded-xl" /><Skeleton className="ml-auto h-16 w-2/3 rounded-xl" /><Skeleton className="h-20 w-3/5 rounded-xl" /></div>
        ) : history.isError && !history.data ? (
          <Alert variant="destructive"><AlertDescription>{errorMessage(history.error)}</AlertDescription></Alert>
        ) : messages.length === 0 ? (
          <div className="m-auto max-w-xs px-4 py-8 text-center">
            <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl border border-primary/15 bg-primary/5 text-primary"><MessageCircle className="size-7" aria-hidden="true" /></div>
            <h3 className="text-base font-semibold">Start the conversation</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Share an update, ask a question or say hello to your team.</p>
            <ArrowDown className="mx-auto mt-5 size-4 text-muted-foreground" aria-hidden="true" />
          </div>
        ) : (
          <div role="log" aria-label="Chat messages" aria-live="polite" className="space-y-4">
            {messages.map((message, index) => {
              const previous = messages[index - 1];
              const newDay = !previous || new Date(previous.createdAt).toDateString() !== new Date(message.createdAt).toDateString();
              const mine = message.authorId === me.id;
              return (
                <Fragment key={message.id}>
                  {newDay && <div className="flex items-center gap-4 py-3"><span className="h-px flex-1 bg-border" /><span className="shrink-0 text-[11px] font-medium text-muted-foreground">{dayLabel(message.createdAt)}</span><span className="h-px flex-1 bg-border" /></div>}
                  <div className={cn('flex items-end gap-2 sm:gap-3', mine && 'flex-row-reverse')}>
                    <UserAvatar name={message.authorName} className={cn('mb-0.5 size-7 shrink-0 sm:size-8', mine && '[&_[data-slot=avatar-fallback]]:bg-primary/10 [&_[data-slot=avatar-fallback]]:text-primary')} />
                    <div className="min-w-0 max-w-[85%] sm:max-w-[78%]">
                      <div className={cn('mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-1', mine && 'justify-end')}>
                        <span className="break-words text-xs font-medium [overflow-wrap:anywhere]">{mine ? 'You' : message.authorName}</span>
                        <time className="text-[10px] tabular-nums text-muted-foreground" dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>{new Date(message.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</time>
                      </div>
                      <p className={cn('whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed [overflow-wrap:anywhere]', mine ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm border bg-card shadow-xs')}>{message.body}</p>
                    </div>
                  </div>
                </Fragment>
              );
            })}
          </div>
        )}
        {history.isError && history.data && <p className="mt-4 text-center text-xs text-destructive" role="alert">{errorMessage(history.error)}</p>}
        <div ref={bottom} />
      </div>
      <form onSubmit={send} className="shrink-0 border-t bg-card px-4 pt-2 pb-4 sm:px-6 sm:pb-5">
        <p className="flex min-h-6 items-center gap-2 text-xs text-muted-foreground" aria-live="polite">{typists.length > 0 && <><span className="flex gap-0.5" aria-hidden="true"><span className="size-1 rounded-full bg-primary" /><span className="size-1 rounded-full bg-primary/70" /><span className="size-1 rounded-full bg-primary/40" /></span>{typists.join(', ')} typing…</>}</p>
        <div className="rounded-xl border bg-background/60 p-3 transition-shadow focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/15">
          <label htmlFor="chat-message" className="mb-1 block px-1 text-xs font-medium text-muted-foreground">Message your team</label>
          <Textarea id="chat-message" value={body} onChange={(event) => {
            setBody(event.target.value);
            if (socket?.connected && Date.now() - lastTyping.current >= 2000) {
              lastTyping.current = Date.now(); socket.emit('chat:typing', { workspaceId }, () => undefined);
            }
          }} onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
              event.preventDefault(); event.currentTarget.form?.requestSubmit();
            }
          }} maxLength={4000} placeholder={`Write to ${workspace.name}…`} aria-label="Message" aria-describedby={error ? 'chat-send-error' : undefined} rows={2} disabled={sending} className="min-h-16 resize-y border-0 px-1 py-2 shadow-none focus-visible:ring-0" />
          <div className="mt-2 flex items-center justify-between gap-2 border-t pt-3">
            <span className="text-[10px] text-muted-foreground"><span className="hidden sm:inline">Ctrl / ⌘ + Enter to send</span><span className="sm:hidden">{body.length.toLocaleString()} / 4,000</span></span>
            <Button type="submit" disabled={!body.trim() || sending} className="min-h-11 rounded-lg px-4 motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 motion-reduce:transition-none">{sending ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Send className="size-3.5" aria-hidden="true" />}{sending ? 'Sending…' : 'Send message'}</Button>
          </div>
        </div>
        {error && <p id="chat-send-error" className="mt-2 text-xs text-destructive" role="alert">{error}</p>}
      </form>
    </section>
  );
}
