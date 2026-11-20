import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { formatRelative } from '@/lib/utils';
import { STATUS_LABEL, UserAvatar } from './task-meta';
import type { ActivityEntry, TaskStatus } from './types';

function Strong({ children }: { children: ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}

function TaskRef({ entry }: { entry: ActivityEntry }) {
  const label = <Strong>{entry.entityTitle}</Strong>;
  return entry.taskId && entry.projectId ? (
    <Link to={`/projects/${entry.projectId}?task=${entry.taskId}`} className="hover:underline">
      {label}
    </Link>
  ) : (
    label
  );
}

/** Turns an activity row into a readable sentence. */
export function describeActivity(entry: ActivityEntry): ReactNode {
  const meta = entry.metadata;
  switch (entry.action) {
    case 'workspace.created':
      return <>created the workspace <Strong>{entry.entityTitle}</Strong></>;
    case 'workspace.updated':
      return <>updated the workspace settings</>;
    case 'member.added':
      return <>added <Strong>{entry.entityTitle}</Strong> as {String(meta.role)}</>;
    case 'member.role_changed':
      return <>changed <Strong>{entry.entityTitle}</Strong>’s role to {String(meta.to)}</>;
    case 'member.removed':
      return <>removed <Strong>{entry.entityTitle}</Strong></>;
    case 'member.left':
      return <>left the workspace</>;
    case 'project.created':
      return <>created project <Strong>{entry.entityTitle}</Strong></>;
    case 'project.updated':
      return <>updated project <Strong>{entry.entityTitle}</Strong></>;
    case 'project.deleted':
      return <>deleted project <Strong>{entry.entityTitle}</Strong></>;
    case 'task.created':
      return <>created <TaskRef entry={entry} /></>;
    case 'task.status_changed':
      return (
        <>
          moved <TaskRef entry={entry} /> to <Strong>{STATUS_LABEL[meta.to as TaskStatus] ?? String(meta.to)}</Strong>
        </>
      );
    case 'task.assigned':
      return meta.assigneeName ? (
        <>assigned <TaskRef entry={entry} /> to <Strong>{String(meta.assigneeName)}</Strong></>
      ) : (
        <>unassigned <TaskRef entry={entry} /></>
      );
    case 'task.updated':
      return <>edited the {(meta.fields as string[] | undefined)?.join(', ') ?? 'details'} of <TaskRef entry={entry} /></>;
    case 'task.deleted':
      return <>deleted <Strong>{entry.entityTitle}</Strong></>;
    default:
      return entry.action;
  }
}

export function ActivityFeed({
  entries,
  loading,
  showContext = false,
  emptyText = 'No activity yet.',
}: {
  entries: ActivityEntry[] | undefined;
  loading?: boolean;
  showContext?: boolean;
  emptyText?: string;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-9" />)}
      </div>
    );
  }
  if (!entries?.length) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <ol className="space-y-5">
      {entries.map((entry) => (
        <li key={entry.id} className="flex gap-3 text-[13px]">
          <UserAvatar name={entry.actor?.displayName ?? '?'} className="mt-0.5 size-7" />
          <div className="min-w-0 flex-1 text-muted-foreground">
            <p className="leading-relaxed">
              <Strong>{entry.actor?.displayName ?? 'Someone'}</Strong> {describeActivity(entry)}
            </p>
            <p className="mt-1.5 text-[10px]">
              {formatRelative(entry.createdAt)}
              {showContext && (
                <>
                  {' · '}
                  {entry.projectName ? `${entry.workspaceName} / ${entry.projectName}` : entry.workspaceName}
                </>
              )}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
