import { ChevronDown, ChevronsUp, Equal, Siren } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn, initials } from '@/lib/utils';
import type { TaskPriority, TaskStatus, WorkspaceRole } from './types';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  IN_REVIEW: 'In review',
  COMPLETED: 'Completed',
};

export const STATUS_DOT: Record<TaskStatus, string> = {
  TODO: 'bg-muted-foreground/60',
  IN_PROGRESS: 'bg-sky-500',
  IN_REVIEW: 'bg-amber-500',
  COMPLETED: 'bg-success',
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = { URGENT: 'Urgent', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };

const PRIORITY_STYLE: Record<TaskPriority, { icon: typeof Siren; className: string }> = {
  URGENT: { icon: Siren, className: 'text-destructive' },
  HIGH: { icon: ChevronsUp, className: 'text-orange-500' },
  MEDIUM: { icon: Equal, className: 'text-amber-500' },
  LOW: { icon: ChevronDown, className: 'text-sky-500' },
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge variant="outline" className="gap-1.5 font-normal">
      <span className={cn('size-2 rounded-full', STATUS_DOT[status])} />
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function PriorityIcon({ priority, withLabel = false }: { priority: TaskPriority; withLabel?: boolean }) {
  const { icon: Icon, className } = PRIORITY_STYLE[priority];
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={`${PRIORITY_LABEL[priority]} priority`}>
      <Icon className={cn('size-3.5', className)} aria-hidden="true" />
      {withLabel ? PRIORITY_LABEL[priority] : <span className="sr-only">{PRIORITY_LABEL[priority]} priority</span>}
    </span>
  );
}

export function RoleBadge({ role }: { role: WorkspaceRole }) {
  return (
    <Badge variant={role === 'owner' ? 'default' : role === 'admin' ? 'secondary' : 'outline'} className="capitalize">
      {role}
    </Badge>
  );
}

export function UserAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <Avatar className={cn('size-6', className)} title={name}>
      <AvatarFallback className="text-[10px]">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

/** 'YYYY-MM-DD' -> local date without the UTC off-by-one shift of `new Date('YYYY-MM-DD')`. */
export function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year!, month! - 1, day!);
}

export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export type DueState = 'overdue' | 'today' | 'soon' | 'later';

export function dueState(dueDate: string, now = new Date()): DueState {
  const today = todayIso(now);
  if (dueDate < today) return 'overdue';
  if (dueDate === today) return 'today';
  const inAWeek = new Date(now);
  inAWeek.setDate(inAWeek.getDate() + 7);
  return dueDate <= todayIso(inAWeek) ? 'soon' : 'later';
}

export function DueDate({ value, completed }: { value: string; completed?: boolean }) {
  const state = dueState(value);
  const label = state === 'today' ? 'Today' : parseDateOnly(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return (
    <span
      className={cn(
        'text-xs tabular-nums',
        !completed && state === 'overdue' && 'font-medium text-destructive',
        !completed && state === 'today' && 'font-medium text-warning',
        (completed || state === 'soon' || state === 'later') && 'text-muted-foreground',
      )}
      title={`Due ${value}`}
    >
      {label}
    </span>
  );
}
