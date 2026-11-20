import { Loader2, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/features/auth/auth-provider';
import { errorMessage, useActivity, useDeleteTask, useTask, useUpdateTask } from '@/features/work/api';
import { ActivityFeed } from '@/features/work/activity-feed';
import type { Member, Task, TaskUpdate, WorkspaceRole } from '@/features/work/types';
import { ApiError } from '@/lib/api-client';
import { formatRelative } from '@/lib/utils';
import { AssigneeSelect, PrioritySelect, StatusSelect } from './task-fields';

function TaskEditor({ task, members, role, onClose }: { task: Task; members: Member[]; role: WorkspaceRole; onClose: () => void }) {
  const me = useCurrentUser();
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const activity = useActivity('tasks', task.id, 50);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Adopt server changes (e.g. after a refetch) unless the user is mid-edit.
  useEffect(() => setTitle(task.title), [task.title]);
  useEffect(() => setDescription(task.description), [task.description]);

  function save(changes: TaskUpdate) {
    update.mutate(
      { task, changes },
      {
        onError: (error) => {
          if (error instanceof ApiError && error.code === 'VERSION_CONFLICT') {
            // The mutation's onSettled refetches the task; the effects above then load
            // the newer title/description. (Resetting here would use this stale closure.)
            toast.error('Someone else changed this task. Showing the latest version; please re-apply your edit.');
          } else {
            toast.error(errorMessage(error));
          }
        },
      },
    );
  }

  function saveTitle() {
    const trimmed = title.trim();
    if (!trimmed) setTitle(task.title);
    else if (trimmed !== task.title) save({ title: trimmed });
  }

  const canDelete = task.reporter?.id === me.id || role !== 'member';
  const descriptionDirty = description !== task.description;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-muted/25 p-6 pr-14">
        <p className="font-mono text-xs text-muted-foreground">
          {task.key} · {task.workspaceName} / {task.projectName}
        </p>
        <DialogTitle className="sr-only">{task.title}</DialogTitle>
        <DialogDescription className="sr-only">Edit task details and see its history</DialogDescription>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setTitle(task.title);
          }}
          maxLength={200}
          aria-label="Title"
          className="mt-1 h-auto border-transparent px-1 text-lg font-semibold shadow-none hover:border-input focus-visible:border-ring"
        />
      </div>

      <div className="min-h-0 flex-1 space-y-7 overflow-y-auto p-6">
        <div className="grid gap-5 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="task-status">Status</Label>
            <StatusSelect id="task-status" value={task.status} onChange={(status) => save({ status })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-priority">Priority</Label>
            <PrioritySelect id="task-priority" value={task.priority} onChange={(priority) => save({ priority })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-assignee">Assignee</Label>
            <AssigneeSelect id="task-assignee" value={task.assignee?.id ?? null} members={members} onChange={(assigneeId) => save({ assigneeId })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-due">Due date</Label>
            <Input id="task-due" type="date" value={task.dueDate ?? ''} onChange={(e) => save({ dueDate: e.target.value || null })} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="task-description">Description</Label>
          <Textarea id="task-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={6} maxLength={10000} placeholder="Add more detail…" />
          {descriptionDirty && (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => save({ description })} disabled={update.isPending}>
                {update.isPending && <Loader2 className="animate-spin" />}
                Save description
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDescription(task.description)}>
                Cancel
              </Button>
            </div>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-muted/40 p-4 text-xs">
          <dt className="text-muted-foreground">Reporter</dt>
          <dd>{task.reporter?.displayName ?? 'Deleted user'}</dd>
          <dt className="text-muted-foreground">Created</dt>
          <dd>{formatRelative(task.createdAt)}</dd>
          <dt className="text-muted-foreground">Updated</dt>
          <dd>{formatRelative(task.updatedAt)}</dd>
          {task.completedAt && (
            <>
              <dt className="text-muted-foreground">Completed</dt>
              <dd>{formatRelative(task.completedAt)}</dd>
            </>
          )}
          <dt className="text-muted-foreground">Version</dt>
          <dd className="tabular-nums">{task.version}</dd>
        </dl>

        <section>
          <h3 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">History</h3>
          <ActivityFeed entries={activity.data} loading={activity.isPending} />
        </section>
      </div>

      {canDelete && (
        <div className="border-t p-4">
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 /> Delete task
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${task.key}?`}
        description={`“${task.title}” will be permanently deleted.`}
        confirmLabel="Delete task"
        onConfirm={async () => {
          try {
            await remove.mutateAsync(task.id);
            toast.success(`${task.key} deleted`);
            onClose();
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />
    </div>
  );
}

/** Side sheet for one task, driven by the `?task=` URL parameter so it can be linked to. */
export function TaskSheet({
  taskId,
  members,
  role,
  onClose,
}: {
  taskId: string | null;
  members: Member[];
  role: WorkspaceRole;
  onClose: () => void;
}) {
  const task = useTask(taskId);
  return (
    <Dialog open={Boolean(taskId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent side="right" className="p-0" aria-describedby={undefined}>
        {task.data ? (
          <TaskEditor key={task.data.id} task={task.data} members={members} role={role} onClose={onClose} />
        ) : task.isError ? (
          <div className="p-6">
            <DialogTitle>Task unavailable</DialogTitle>
            <p className="mt-2 text-sm text-muted-foreground">{errorMessage(task.error)}</p>
          </div>
        ) : (
          <div className="space-y-4 p-6">
            <DialogTitle className="sr-only">Loading task</DialogTitle>
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-32" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
