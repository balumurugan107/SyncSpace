import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlignLeft } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { DueDate, PriorityIcon, UserAvatar } from '@/features/work/task-meta';
import type { Task } from '@/features/work/types';
import { cn } from '@/lib/utils';

export function TaskCardView({ task, dragging, overlay }: { task: Task; dragging?: boolean; overlay?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-4 text-left shadow-[0_2px_4px_-2px_rgb(15_23_42_/_0.08)] transition-[border-color,box-shadow] hover:border-primary/25 hover:shadow-md',
        dragging && 'opacity-40',
        overlay && 'cursor-grabbing shadow-lg ring-2 ring-primary/40',
      )}
    >
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="font-mono">{task.key}</span>
        <PriorityIcon priority={task.priority} />
        {task.dueDate && (
          <span className="ml-auto">
            <DueDate value={task.dueDate} completed={task.status === 'COMPLETED'} />
          </span>
        )}
      </div>
      <p className={cn('mt-3 text-[13px] leading-relaxed font-medium break-words [overflow-wrap:anywhere]', task.status === 'COMPLETED' && 'text-muted-foreground line-through decoration-muted-foreground/50')}>
        {task.title}
      </p>
      <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3">
        {task.description ? <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><AlignLeft className="size-3" /> Details</span> : <span />}
        {task.assignee ? (
          <UserAvatar name={task.assignee.displayName} />
        ) : (
          <span className="flex size-6 items-center justify-center rounded-full border border-dashed text-[10px] text-muted-foreground" title="Unassigned">
            ?
          </span>
        )}
      </div>
    </div>
  );
}

/** Draggable card. Pointer: drag after moving 5px, click to open. Keyboard: Space to pick up, arrows to move, Enter on focus opens. */
export function SortableTaskCard({ task, onOpen }: { task: Task; onOpen: (task: Task) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, data: { task } });

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // While a keyboard drag is in progress Enter means "drop", so leave it to dnd-kit.
    if (event.key === 'Enter' && !isDragging) {
      event.preventDefault();
      onOpen(task);
      return;
    }
    listeners?.onKeyDown?.(event);
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onKeyDown={onKeyDown}
      onClick={() => onOpen(task)}
      aria-label={`${task.key}: ${task.title}. Press Space to move, Enter to open.`}
      className="cursor-grab rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
    >
      <TaskCardView task={task} dragging={isDragging} />
    </div>
  );
}
