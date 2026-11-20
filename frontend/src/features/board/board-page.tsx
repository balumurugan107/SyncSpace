import { PresenceBadge } from '@/features/realtime/presence-badge';
import { History, MoreHorizontal, Plus, RefreshCw, Search, Settings } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/features/auth/auth-provider';
import { errorMessage, useActivity, useBoard, useMembers, useMoveTask, useProject } from '@/features/work/api';
import { ActivityFeed } from '@/features/work/activity-feed';
import { PRIORITY_LABEL } from '@/features/work/task-meta';
import { TASK_PRIORITIES, type TaskStatus } from '@/features/work/types';
import { matchesFilters, type BoardFilters } from './board-logic';
import { KanbanBoard } from './kanban-board';
import { NewTaskDialog } from './new-task-dialog';
import { ProjectSettingsDialog } from './project-settings-dialog';
import { TaskSheet } from './task-sheet';

function ProjectActivityDialog({ projectId, open, onOpenChange }: { projectId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const activity = useActivity('projects', projectId, 50);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent side="right" className="max-w-md p-0">
        <DialogHeader className="border-b p-5">
          <DialogTitle>Project activity</DialogTitle>
          <DialogDescription>Every change on this board, newest first.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-5">
          <ActivityFeed entries={activity.data} loading={activity.isPending} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function BoardPage() {
  const { projectId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const me = useCurrentUser();
  const project = useProject(projectId);
  const board = useBoard(projectId);
  const members = useMembers(project.data?.workspaceId);
  const move = useMoveTask(projectId);

  const [filters, setFilters] = useState<BoardFilters>({ search: '', assignee: 'any', priority: 'any' });
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>('TODO');
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const openTaskId = searchParams.get('task');
  const setOpenTask = (id: string | null) =>
    setSearchParams(
      (params) => {
        if (id) params.set('task', id);
        else params.delete('task');
        return params;
      },
      { replace: !id },
    );

  const isVisible = useMemo(() => (task: Parameters<typeof matchesFilters>[0]) => matchesFilters(task, filters, me.id), [filters, me.id]);
  const filtering = filters.search !== '' || filters.assignee !== 'any' || filters.priority !== 'any';

  if (project.isError || board.isError) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(project.error ?? board.error)}</AlertDescription>
        </Alert>
        <Button asChild variant="outline">
          <Link to="/projects">Back to projects</Link>
        </Button>
      </div>
    );
  }
  if (project.isPending || board.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-96 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const p = project.data;
  const memberList = members.data ?? [];

  return (
    <div className="page-content">
      <nav className="mb-5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-label="Breadcrumb">
        <Link to={`/workspaces/${p.workspaceId}`} className="hover:text-foreground">{p.workspaceName}</Link> / <span className="text-foreground">{p.name}</span>
      </nav>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="rounded bg-primary/10 px-2 py-1 font-mono text-xs font-semibold text-primary">{p.key}</span>
        <h1 className="max-w-full break-words text-[28px] font-semibold tracking-[-0.035em]">{p.name}</h1>
        <PresenceBadge workspaceId={p.workspaceId} />
        <div className="ml-auto flex items-center gap-2">
          <Button
            onClick={() => {
              setNewTaskStatus('TODO');
              setNewTaskOpen(true);
            }}
          >
            <Plus /> New task
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Project menu">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setActivityOpen(true)}>
                <History /> Activity
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void board.refetch()}>
                <RefreshCw /> Refresh board
              </DropdownMenuItem>
              {p.role !== 'member' && (
                <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
                  <Settings /> Project settings
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="surface-toolbar mb-6">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter by title or key"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="pl-8"
            aria-label="Filter tasks"
          />
        </div>
        <Select value={filters.assignee} onValueChange={(assignee) => setFilters({ ...filters, assignee })}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Filter by assignee">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Anyone</SelectItem>
            <SelectItem value="me">Assigned to me</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {memberList.filter((m) => m.userId !== me.id).map((m) => (
              <SelectItem key={m.userId} value={m.userId}>{m.displayName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.priority} onValueChange={(priority) => setFilters({ ...filters, priority: priority as BoardFilters['priority'] })}>
          <SelectTrigger className="w-full sm:w-36" aria-label="Filter by priority">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any priority</SelectItem>
            {TASK_PRIORITIES.map((priority) => (
              <SelectItem key={priority} value={priority}>{PRIORITY_LABEL[priority]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtering && (
          <Button variant="ghost" size="sm" onClick={() => setFilters({ search: '', assignee: 'any', priority: 'any' })}>
            Clear filters
          </Button>
        )}
        <p className="w-full px-1 text-[10px] text-muted-foreground xl:ml-auto xl:w-auto" title="Live updates use authenticated workspace connections">
          Teammates’ changes sync live. Updates pause while you drag.
        </p>
      </div>

      <p className="mb-3 text-[11px] text-muted-foreground lg:hidden">Scroll horizontally to see all four columns.</p>
      <KanbanBoard
        tasks={board.data}
        isVisible={isVisible}
        onOpen={(task) => setOpenTask(task.id)}
        onAdd={(status) => {
          setNewTaskStatus(status);
          setNewTaskOpen(true);
        }}
        onMove={(task, status, afterTaskId) => move.mutate({ task, status, afterTaskId })}
      />

      <NewTaskDialog
        projectId={p.id}
        members={memberList}
        status={newTaskStatus}
        onStatusChange={setNewTaskStatus}
        open={newTaskOpen}
        onOpenChange={setNewTaskOpen}
      />
      <TaskSheet taskId={openTaskId} members={memberList} role={p.role} onClose={() => setOpenTask(null)} />
      <ProjectActivityDialog projectId={p.id} open={activityOpen} onOpenChange={setActivityOpen} />
      {p.role !== 'member' && (
        <ProjectSettingsDialog key={p.updatedAt} project={p} open={settingsOpen} onOpenChange={setSettingsOpen} />
      )}
    </div>
  );
}
