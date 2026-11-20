import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PRIORITY_LABEL, PriorityIcon, STATUS_DOT, STATUS_LABEL } from '@/features/work/task-meta';
import { TASK_PRIORITIES, TASK_STATUSES, type Member, type TaskPriority, type TaskStatus } from '@/features/work/types';
import { cn } from '@/lib/utils';

const UNASSIGNED = '__unassigned__';

export function StatusSelect({ value, onChange, id }: { value: TaskStatus; onChange: (v: TaskStatus) => void; id?: string }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as TaskStatus)}>
      <SelectTrigger id={id} aria-label="Status">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TASK_STATUSES.map((status) => (
          <SelectItem key={status} value={status}>
            <span className={cn('size-2 rounded-full', STATUS_DOT[status])} /> {STATUS_LABEL[status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PrioritySelect({ value, onChange, id }: { value: TaskPriority; onChange: (v: TaskPriority) => void; id?: string }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as TaskPriority)}>
      <SelectTrigger id={id} aria-label="Priority">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TASK_PRIORITIES.map((priority) => (
          <SelectItem key={priority} value={priority}>
            <PriorityIcon priority={priority} /> {PRIORITY_LABEL[priority]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AssigneeSelect({
  value,
  members,
  onChange,
  id,
}: {
  value: string | null;
  members: Member[];
  onChange: (v: string | null) => void;
  id?: string;
}) {
  return (
    <Select value={value ?? UNASSIGNED} onValueChange={(v) => onChange(v === UNASSIGNED ? null : v)}>
      <SelectTrigger id={id} aria-label="Assignee">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
        {members.map((member) => (
          <SelectItem key={member.userId} value={member.userId}>
            {member.displayName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
