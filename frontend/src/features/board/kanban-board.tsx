import {
  closestCorners,
  pointerWithin,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { STATUS_DOT, STATUS_LABEL } from '@/features/work/task-meta';
import { TASK_STATUSES, type Task, type TaskStatus } from '@/features/work/types';
import { useRealtime } from '@/features/realtime/realtime-provider';
import { cn } from '@/lib/utils';
import { findColumn, groupIntoColumns, type Columns } from './board-logic';
import { SortableTaskCard, TaskCardView } from './task-card';

function Column({
  status,
  tasks,
  total,
  onOpen,
  onAdd,
}: {
  status: TaskStatus;
  tasks: Task[];
  total: number;
  onOpen: (task: Task) => void;
  onAdd: (status: TaskStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section className="flex w-[280px] shrink-0 flex-col rounded-2xl border border-border/60 bg-muted/40 lg:w-auto lg:min-w-0 lg:flex-1" aria-label={STATUS_LABEL[status]}>
      <header className="flex items-center gap-2 border-b border-border/60 px-4 pt-3 pb-3">
        <span className={cn('size-2 rounded-full', STATUS_DOT[status])} />
        <h2 className="text-sm font-semibold">{STATUS_LABEL[status]}</h2>
        <span className="flex min-w-5 items-center justify-center rounded-md bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground tabular-nums">
          {tasks.length}
          {tasks.length !== total && ` / ${total}`}
        </span>
        <Button variant="ghost" size="icon" className="ml-auto size-7" onClick={() => onAdd(status)} aria-label={`Add task to ${STATUS_LABEL[status]}`}>
          <Plus />
        </Button>
      </header>
      <SortableContext id={status} items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={cn('flex min-h-[440px] flex-1 flex-col gap-3 rounded-b-2xl p-3 transition-colors', isOver && 'bg-primary/5')}>
          {tasks.map((task) => (
            <SortableTaskCard key={task.id} task={task} onOpen={onOpen} />
          ))}
          {tasks.length === 0 && (
            <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">Drop tasks here</p>
          )}
        </div>
      </SortableContext>
    </section>
  );
}

/**
 * Four-column board with drag-and-drop between and within columns.
 * `isVisible` hides filtered-out cards; drop positions are computed relative to the
 * cards the user can actually see.
 */
export function KanbanBoard({
  tasks,
  isVisible,
  onOpen,
  onAdd,
  onMove,
}: {
  tasks: Task[];
  isVisible: (task: Task) => boolean;
  onOpen: (task: Task) => void;
  onAdd: (status: TaskStatus) => void;
  onMove: (task: Task, status: TaskStatus, afterTaskId: string | null) => void;
}) {
  const { setDragging } = useRealtime();
  useEffect(() => () => setDragging(false), [setDragging]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const serverColumns = useMemo(() => groupIntoColumns(tasks), [tasks]);

  // While dragging (and until the optimistic update lands) the board renders from
  // local state so cards follow the pointer between columns.
  const [dragColumns, setDragColumns] = useState<Columns | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const settling = useRef(false);
  const origin = useRef<{ status: TaskStatus; anchor: string | null } | null>(null);

  useEffect(() => {
    if (settling.current) {
      settling.current = false;
      setDragColumns(null);
    }
  }, [tasks]);

  const columns = dragColumns ?? serverColumns;
  const visibleColumn = (cols: Columns, status: TaskStatus) =>
    cols[status].map((id) => byId.get(id)).filter((t): t is Task => Boolean(t) && isVisible(t!));
  const visibleAnchor = (cols: Columns, status: TaskStatus, id: string) => {
    const visible = visibleColumn(cols, status).map((t) => t.id);
    const index = visible.indexOf(id);
    return index > 0 ? visible[index - 1]! : null;
  };

  function onDragStart({ active }: DragStartEvent) {
    const id = String(active.id);
    const status = findColumn(serverColumns, id);
    if (!status) return;
    setDragging(true);
    setActiveId(id);
    setDragColumns(serverColumns);
    origin.current = { status, anchor: visibleAnchor(serverColumns, status, id) };
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    setDragColumns((current) => {
      if (!current) return current;
      const from = findColumn(current, String(active.id));
      const to = findColumn(current, String(over.id));
      if (!from || !to || from === to) return current;
      const target = current[to].filter((id) => id !== active.id);
      const overIndex = target.indexOf(String(over.id));
      target.splice(overIndex >= 0 ? overIndex : target.length, 0, String(active.id));
      return { ...current, [from]: current[from].filter((id) => id !== active.id), [to]: target };
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const id = String(active.id);
    setDragging(false);
    setActiveId(null);
    let final = dragColumns;
    if (!over || !final || !origin.current) {
      setDragColumns(null);
      return;
    }
    const status = findColumn(final, id)!;
    const overId = String(over.id);
    if (overId !== id && final[status].includes(overId)) {
      const column = final[status];
      final = { ...final, [status]: arrayMove(column, column.indexOf(id), column.indexOf(overId)) };
    }
    const anchor = visibleAnchor(final, status, id);
    const task = byId.get(id);
    if (!task || (status === origin.current.status && anchor === origin.current.anchor)) {
      setDragColumns(null);
      return;
    }
    setDragColumns(final);
    settling.current = true;
    onMove(task, status, anchor);
  }

  const activeTask = activeId ? byId.get(activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={(args) => {
        // Tall columns should follow the pointer; keyboard drags retain corner targeting.
        const hits = pointerWithin(args);
        return hits.length ? hits : closestCorners(args);
      }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setDragging(false);
        setActiveId(null);
        setDragColumns(null);
      }}
    >
      {/* `relative` makes this scroller the containing block for absolutely positioned
          descendants (e.g. sr-only text); otherwise they escape the horizontal clip and
          widen the whole page on phones. */}
      <div className="relative -mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        {TASK_STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            tasks={visibleColumn(columns, status)}
            total={columns[status].length}
            onOpen={onOpen}
            onAdd={onAdd}
          />
        ))}
      </div>
      <DragOverlay>{activeTask ? <TaskCardView task={activeTask} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}
