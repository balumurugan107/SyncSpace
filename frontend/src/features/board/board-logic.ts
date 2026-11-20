import { TASK_STATUSES, type Task, type TaskStatus } from '@/features/work/types';

/**
 * Pure Kanban helpers shared by the drag-and-drop UI and the optimistic cache
 * update. They mirror the server's fractional positioning so the card lands in the
 * same place before and after the server confirms.
 */
export type Columns = Record<TaskStatus, string[]>;

const GAP = 1024;

export function groupIntoColumns(tasks: Task[]): Columns {
  const columns: Columns = { TODO: [], IN_PROGRESS: [], IN_REVIEW: [], COMPLETED: [] };
  for (const task of [...tasks].sort((a, b) => a.position - b.position)) columns[task.status].push(task.id);
  return columns;
}

export function findColumn(columns: Columns, id: string): TaskStatus | null {
  if ((TASK_STATUSES as string[]).includes(id)) return id as TaskStatus;
  return TASK_STATUSES.find((status) => columns[status].includes(id)) ?? null;
}

/** The anchor the server needs: the card directly above the dropped card, or null for the top. */
export function anchorFor(columns: Columns, status: TaskStatus, taskId: string): string | null {
  const column = columns[status];
  const index = column.indexOf(taskId);
  return index > 0 ? column[index - 1]! : null;
}

/** Client-side copy of the server's position rule, for the optimistic update. */
export function positionAfter(tasks: Task[], status: TaskStatus, movingId: string, afterTaskId: string | null): number {
  const column = tasks
    .filter((t) => t.status === status && t.id !== movingId)
    .sort((a, b) => a.position - b.position);
  const index = afterTaskId ? column.findIndex((t) => t.id === afterTaskId) : -1;
  const before = index >= 0 ? column[index]!.position : null;
  const after = column[index + 1]?.position ?? null;
  if (before === null && after === null) return GAP;
  if (before === null) return after! - GAP;
  if (after === null) return before + GAP;
  return (before + after) / 2;
}

export function applyMove(tasks: Task[], taskId: string, status: TaskStatus, afterTaskId: string | null): Task[] {
  const position = positionAfter(tasks, status, taskId, afterTaskId);
  return tasks.map((task) => (task.id === taskId ? { ...task, status, position } : task));
}

export interface BoardFilters {
  search: string;
  assignee: 'any' | 'me' | 'unassigned' | string;
  priority: 'any' | Task['priority'];
}

export function matchesFilters(task: Task, filters: BoardFilters, currentUserId: string): boolean {
  const query = filters.search.trim().toLowerCase();
  if (query && !`${task.key} ${task.title}`.toLowerCase().includes(query)) return false;
  if (filters.priority !== 'any' && task.priority !== filters.priority) return false;
  if (filters.assignee === 'me') return task.assignee?.id === currentUserId;
  if (filters.assignee === 'unassigned') return task.assignee === null;
  if (filters.assignee !== 'any') return task.assignee?.id === filters.assignee;
  return true;
}
