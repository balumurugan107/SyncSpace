import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/features/auth/form-field';
import { errorMessage, useCreateTask } from '@/features/work/api';
import type { Member, TaskPriority, TaskStatus } from '@/features/work/types';
import { ApiError } from '@/lib/api-client';
import { AssigneeSelect, PrioritySelect, StatusSelect } from './task-fields';

const EMPTY = { title: '', description: '', priority: 'MEDIUM' as TaskPriority, assigneeId: null as string | null, dueDate: '' };

export function NewTaskDialog({
  projectId,
  members,
  status,
  onStatusChange,
  open,
  onOpenChange,
}: {
  projectId: string;
  members: Member[];
  status: TaskStatus;
  onStatusChange: (status: TaskStatus) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [form, setForm] = useState(EMPTY);
  const create = useCreateTask(projectId);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      const task = await create.mutateAsync({ ...form, status, dueDate: form.dueDate || null });
      toast.success(`${task.key} created`);
      setForm(EMPTY);
      create.reset();
      onOpenChange(false);
    } catch {
      /* rendered below */
    }
  }

  const fieldErrors = create.error instanceof ApiError ? create.error.fieldErrors : {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <form onSubmit={onSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>New task</DialogTitle>
            <DialogDescription>It will be added to the bottom of the chosen column.</DialogDescription>
          </DialogHeader>
          <FormField label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} required autoFocus error={fieldErrors.title} />
          <div className="space-y-2">
            <Label htmlFor="new-task-description">Description</Label>
            <Textarea id="new-task-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} maxLength={10000} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new-task-status">Status</Label>
              <StatusSelect id="new-task-status" value={status} onChange={onStatusChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-task-priority">Priority</Label>
              <PrioritySelect id="new-task-priority" value={form.priority} onChange={(priority) => setForm({ ...form, priority })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-task-assignee">Assignee</Label>
              <AssigneeSelect id="new-task-assignee" value={form.assigneeId} members={members} onChange={(assigneeId) => setForm({ ...form, assigneeId })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-task-due">Due date</Label>
              <Input id="new-task-due" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
          </div>
          {create.isError && !Object.keys(fieldErrors).length && <p className="text-sm text-destructive">{errorMessage(create.error)}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!form.title.trim() || create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" />}
              Create task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
