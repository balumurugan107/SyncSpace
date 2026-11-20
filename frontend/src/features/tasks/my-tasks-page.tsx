import { CalendarClock, CheckCircle2, ListTodo } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { CollectionSummary } from '@/components/page-primitives';
import { PageHeader } from '@/components/layout/app-shell';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { errorMessage, useMyTasks } from '@/features/work/api';
import { DueDate, PriorityIcon, StatusBadge, dueState } from '@/features/work/task-meta';
import type { Task } from '@/features/work/types';

type Group = 'Overdue' | 'Due today' | 'Due this week' | 'Later' | 'No due date' | 'Completed';
const GROUP_ORDER: Group[] = ['Overdue', 'Due today', 'Due this week', 'Later', 'No due date', 'Completed'];

export function groupMyTasks(tasks: Task[], now = new Date()): [Group, Task[]][] {
  const groups = new Map<Group, Task[]>();
  for (const task of tasks) {
    let group: Group;
    if (task.status === 'COMPLETED') group = 'Completed';
    else if (!task.dueDate) group = 'No due date';
    else {
      const state = dueState(task.dueDate, now);
      group = state === 'overdue' ? 'Overdue' : state === 'today' ? 'Due today' : state === 'soon' ? 'Due this week' : 'Later';
    }
    groups.set(group, [...(groups.get(group) ?? []), task]);
  }
  return GROUP_ORDER.filter((g) => groups.has(g)).map((g) => [g, groups.get(g)!]);
}

function TaskRow({ task }: { task: Task }) {
  return (
    <li>
      <Link
        to={`/projects/${task.projectId}?task=${task.id}`}
        className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4 transition-colors hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none"
      >
        <PriorityIcon priority={task.priority} />
        <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">{task.key}</span>
        <span className="min-w-[120px] flex-1 break-words text-[13px] font-medium">{task.title}</span>
        <span className="hidden truncate text-xs text-muted-foreground xl:inline xl:max-w-44">
          {task.workspaceName} / {task.projectName}
        </span>
        <StatusBadge status={task.status} />
        <span className="w-14 text-right">{task.dueDate && <DueDate value={task.dueDate} completed={task.status === 'COMPLETED'} />}</span>
      </Link>
    </li>
  );
}

export function MyTasksPage() {
  const [scope, setScope] = useState<'open' | 'all'>('open');
  const tasks = useMyTasks(scope);

  return (
    <div className="page-content">
      <PageHeader
        eyebrow="Your personal workspace"
        title="My Tasks"
        description="One list for everything on your plate. Start with what needs you most."
        actions={
          <Tabs value={scope} onValueChange={(v) => setScope(v as 'open' | 'all')}>
            <TabsList>
              <TabsTrigger value="open">Open</TabsTrigger>
              <TabsTrigger value="all">Include completed</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />
      {tasks.data && <CollectionSummary items={[{ label: 'Tasks in this view', value: tasks.data.length, icon: ListTodo }, { label: 'With a due date', value: tasks.data.filter((task) => task.dueDate && task.status !== 'COMPLETED').length, icon: CalendarClock }, { label: 'Completed in this view', value: tasks.data.filter((task) => task.status === 'COMPLETED').length, icon: CheckCircle2 }]} />}
      {tasks.isPending ? (
        <Skeleton className="h-64" />
      ) : tasks.isError ? (
        <p className="text-sm text-destructive">{errorMessage(tasks.error)}</p>
      ) : tasks.data.length === 0 ? (
        <Card className="items-center border-dashed px-6 py-20 text-center">
          <ListTodo className="size-6 text-muted-foreground" />
          <div>
            <p className="font-medium">Nothing assigned to you</p>
            <p className="mt-1 text-sm text-muted-foreground">Tasks assigned to you on any board show up here.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {groupMyTasks(tasks.data).map(([group, items]) => (
            <section key={group}>
              <h2 className={`mb-2 text-sm font-semibold ${group === 'Overdue' ? 'text-destructive' : ''}`}>
                {group} <span className="font-normal text-muted-foreground">{items.length}</span>
              </h2>
              <Card className="gap-0 overflow-hidden py-0">
                <ul className="divide-y">
                  {items.map((task) => <TaskRow key={task.id} task={task} />)}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
