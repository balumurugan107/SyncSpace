import { ArrowUpRight, FolderKanban, ListTodo } from 'lucide-react';
import { Link } from 'react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { STATUS_DOT, STATUS_LABEL } from '@/features/work/task-meta';
import { TASK_STATUSES, type Project } from '@/features/work/types';
import { cn } from '@/lib/utils';

export function ProjectCard({ project, showWorkspace = false }: { project: Project; showWorkspace?: boolean }) {
  const total = TASK_STATUSES.reduce((sum, status) => sum + project.taskCounts[status], 0);
  const done = project.taskCounts.COMPLETED;
  return (
    <Link to={`/projects/${project.id}`} className="group min-w-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card className="collection-card gap-6">
        <CardHeader><div className="mb-3 flex items-center justify-between"><span className="collection-mark"><FolderKanban className="size-5" /></span><ArrowUpRight className="size-4 text-muted-foreground/50 transition-colors group-hover:text-primary" /></div><div className="flex items-center gap-2"><span className="font-mono text-[10px] font-medium text-primary">{project.key}</span>{showWorkspace && <span className="truncate text-[11px] text-muted-foreground">/ {project.workspaceName}</span>}</div><CardTitle className="truncate text-base">{project.name}</CardTitle><CardDescription className="line-clamp-2 min-h-10">{project.description || 'A shared board for your team’s next steps.'}</CardDescription></CardHeader>
        <CardContent className="mt-auto space-y-3"><div className="flex items-center justify-between text-[11px] text-muted-foreground"><span className="flex items-center gap-1.5"><ListTodo className="size-3.5" />{total} tasks</span><span className="font-medium tabular-nums">{total ? Math.round(done / total * 100) : 0}% complete</span></div><div className="flex h-1.5 overflow-hidden rounded-full bg-muted" aria-label={`${done} of ${total} tasks completed`}>{total > 0 && TASK_STATUSES.map((status) => <span key={status} className={cn(STATUS_DOT[status])} style={{ width: `${project.taskCounts[status] / total * 100}%` }} title={`${STATUS_LABEL[status]}: ${project.taskCounts[status]}`} />)}</div><p className="text-[10px] text-muted-foreground">{total === 0 ? 'No tasks yet' : `${done} of ${total} tasks completed`}</p></CardContent>
      </Card>
    </Link>
  );
}
