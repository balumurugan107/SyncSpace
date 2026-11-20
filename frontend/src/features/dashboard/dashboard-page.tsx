import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, FolderKanban, Layers3, ListTodo, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/layout/app-shell';
import { CURRENT_PHASE } from '@/components/layout/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/features/auth/auth-provider';
import { ActivityFeed } from '@/features/work/activity-feed';
import { errorMessage, useDashboard, useMyTasks, useWorkspaces } from '@/features/work/api';
import { DueDate, PriorityIcon, STATUS_DOT, STATUS_LABEL } from '@/features/work/task-meta';
import { TASK_STATUSES } from '@/features/work/types';
import { CreateWorkspaceDialog } from '@/features/workspaces/create-workspace-dialog';
import { cn } from '@/lib/utils';

function greeting(date = new Date()): string {
  return date.getHours() < 12 ? 'Good morning' : date.getHours() < 18 ? 'Good afternoon' : 'Good evening';
}

const ROADMAP = ['Identity & foundation', 'Workspaces, projects & Kanban', 'Redis caching & pub/sub', 'Real-time collaboration', 'Background jobs & notifications', 'Files & object storage', 'Elasticsearch search', 'Nginx & scaling', 'Metrics & monitoring', 'Kafka analytics', 'Kubernetes & production'];
const STATUS_COLOR = ['var(--muted-foreground)', '#38a3e8', '#d59b33', 'var(--success)'];

export function DashboardPage() {
  const user = useCurrentUser();
  const dashboard = useDashboard();
  const myTasks = useMyTasks('open');
  const workspaces = useWorkspaces();
  const summary = dashboard.data?.summary;
  const total = summary ? TASK_STATUSES.reduce((sum, status) => sum + Number(summary.byStatus[status]), 0) : 0;
  let accumulated = 0;
  const segments = TASK_STATUSES.map((status, index) => {
    const start = accumulated;
    accumulated += total ? Number(summary?.byStatus[status] ?? 0) / total * 100 : 0;
    return `${STATUS_COLOR[index]} ${start}% ${accumulated}%`;
  });
  const stats = [
    { label: 'Assigned to you', value: summary?.assignedOpen, icon: ListTodo, detail: 'Open tasks across your teams', danger: false },
    { label: 'Due this week', value: summary?.dueThisWeek, icon: CalendarClock, detail: 'Today and the next 7 days', danger: false },
    { label: 'Completed', value: summary?.completedLast7Days, icon: CheckCircle2, detail: 'Finished in the last 7 days', danger: false },
    { label: 'Overdue', value: summary?.overdue, icon: AlertTriangle, detail: 'Tasks that need your attention', danger: Boolean(summary?.overdue) },
  ];

  return (
    <div className="page-content">
      <PageHeader eyebrow="Your overview" title={`${greeting()}, ${user.displayName.split(/\s+/)[0]}`} description="Here's where things stand. Make room for your next good idea." actions={<Button asChild><Link to="/tasks">View my tasks <ArrowRight /></Link></Button>} />
      {dashboard.isError && <Alert variant="destructive"><AlertDescription>{errorMessage(dashboard.error)}</AlertDescription></Alert>}
      {workspaces.data?.length === 0 && <Card className="flex-row flex-wrap items-center gap-4 px-6"><span className="collection-mark"><Layers3 className="size-5" /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">Create your first workspace</p><p className="mt-1 text-xs text-muted-foreground">Bring your team, projects and conversations together.</p></div><CreateWorkspaceDialog trigger={<Button><Plus /> New workspace</Button>} /></Card>}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">{stats.map(({ label, value, icon: Icon, detail, danger }) => <Link key={label} to="/tasks" className="group rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring"><Card className="collection-card gap-5"><CardHeader className="flex-row items-center justify-between px-4 sm:px-6"><span className="text-xs font-medium text-muted-foreground">{label}</span><span className={cn('flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground', danger && 'bg-destructive/10 text-destructive')}><Icon className="size-4" /></span></CardHeader><CardContent className="px-4 sm:px-6"><div className={cn('text-[34px] leading-none font-semibold tracking-[-0.05em] tabular-nums', danger && 'text-destructive')}>{value === undefined ? <Skeleton className="h-9 w-12" /> : value}</div><p className="mt-3 text-[11px] text-muted-foreground">{detail}</p></CardContent></Card></Link>)}</div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
        <Card className="min-w-0"><CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle>Your focus list</CardTitle><CardDescription>The next tasks on your list.</CardDescription></div><Button asChild variant="ghost" size="sm"><Link to="/tasks">All my tasks <ArrowRight /></Link></Button></CardHeader><CardContent>
          {myTasks.isPending ? <Skeleton className="h-56" /> : myTasks.isError ? <p className="text-sm text-destructive">{errorMessage(myTasks.error)}</p> : !myTasks.data?.length ? <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 text-center"><CheckCircle2 className="mb-3 size-7 text-success" /><p className="text-sm font-medium">Room to focus</p><p className="mt-1 text-xs text-muted-foreground">Nothing assigned to you right now.</p></div> : <ul className="divide-y">{myTasks.data.slice(0, 6).map((task) => <li key={task.id}><Link to={`/projects/${task.projectId}?task=${task.id}`} className="group flex min-h-16 items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted/60"><span className={cn('size-3.5 shrink-0 rounded-full border-2', task.status === 'IN_PROGRESS' ? 'border-sky-500' : task.status === 'IN_REVIEW' ? 'border-amber-500' : 'border-muted-foreground/40')} /><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{task.title}</p><p className="mt-1 truncate text-[11px] text-muted-foreground">{task.key} <span className="px-1">/</span> {task.projectName}</p></div><PriorityIcon priority={task.priority} />{task.dueDate && <DueDate value={task.dueDate} />}<ArrowRight className="hidden size-3.5 text-muted-foreground group-hover:text-primary sm:block" /></Link></li>)}</ul>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Work in balance</CardTitle><CardDescription>All tasks assigned to you, by status.</CardDescription></CardHeader><CardContent>
          {!summary ? <Skeleton className="h-56" /> : <><div className="relative mx-auto my-2 flex size-40 items-center justify-center rounded-full" style={{ background: total ? `conic-gradient(${segments.join(', ')})` : 'var(--muted)' }} role="img" aria-label={`${total} assigned tasks. ${TASK_STATUSES.map((status) => `${STATUS_LABEL[status]}: ${summary.byStatus[status]}`).join('. ')}`}><div className="flex size-[122px] flex-col items-center justify-center rounded-full bg-card"><span className="text-[32px] font-semibold tracking-tight tabular-nums">{total}</span><span className="text-[11px] text-muted-foreground">total tasks</span></div></div><dl className="mt-6 space-y-3">{TASK_STATUSES.map((status) => <div key={status} className="flex items-center gap-2.5 text-xs"><span className={cn('size-2 rounded-full', STATUS_DOT[status])} /><dt className="flex-1 text-muted-foreground">{STATUS_LABEL[status]}</dt><dd className="font-medium tabular-nums">{summary.byStatus[status]}</dd></div>)}</dl></>}
        </CardContent></Card>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
        <Card><CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle>Your workspaces</CardTitle><CardDescription>The teams behind your work.</CardDescription></div><Button asChild variant="ghost" size="sm"><Link to="/workspaces">View all <ArrowRight /></Link></Button></CardHeader><CardContent>{workspaces.isPending ? <Skeleton className="h-36" /> : workspaces.isError ? <p className="text-sm text-destructive">{errorMessage(workspaces.error)}</p> : !workspaces.data?.length ? <p className="py-6 text-sm text-muted-foreground">Your workspaces will appear here.</p> : <div className="grid gap-3 sm:grid-cols-2">{workspaces.data.slice(0, 4).map((workspace) => <Link key={workspace.id} to={`/workspaces/${workspace.id}`} className="flex min-w-0 items-center gap-3 rounded-xl border p-4 transition-colors hover:border-primary/30 hover:bg-muted/30"><span className="collection-mark size-10 text-sm font-semibold">{workspace.name.slice(0, 2).toUpperCase()}</span><div className="min-w-0"><p className="truncate text-[13px] font-medium">{workspace.name}</p><p className="mt-1 text-[11px] text-muted-foreground">{workspace.projectCount} projects · {workspace.memberCount} members</p></div></Link>)}</div>}</CardContent></Card>
        <Card><CardHeader><CardTitle>Recent activity</CardTitle><CardDescription>The latest from your teams.</CardDescription></CardHeader><CardContent><ActivityFeed entries={dashboard.data?.recentActivity?.slice(0, 5)} loading={dashboard.isPending} showContext emptyText="Activity from your workspaces will appear here." /></CardContent></Card>
      </div>
      <details className="rounded-xl border bg-card px-5 py-4"><summary className="cursor-pointer text-xs font-medium text-muted-foreground">Build roadmap <span className="ml-2 text-[10px]">Phase {CURRENT_PHASE} of 11</span></summary><ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{ROADMAP.map((title, index) => <li key={title} className="flex items-center gap-2 py-2 text-xs">{index < CURRENT_PHASE ? <CheckCircle2 className="size-3.5 shrink-0 text-success" /> : <FolderKanban className="size-3.5 shrink-0 text-muted-foreground/50" />}<span className="text-muted-foreground">{index + 1}.</span>{title}</li>)}</ol></details>
    </div>
  );
}
