export interface WorkspaceEvent {
  id: string; type: string; workspaceId: string; projectId: string | null;
  taskId: string | null; actorId: string;
}
export function rememberEvent(seen: Set<string>, id: string): boolean {
  if (seen.has(id)) return false;
  seen.add(id);
  if (seen.size > 5000) seen.delete(seen.values().next().value!);
  return true;
}
/** Query invalidation reuses the HTTP authorization gate instead of trusting pushed data. */
export function eventQueryKeys(event: WorkspaceEvent): (readonly unknown[])[] {
  if (event.type === 'chat.message') return [['chat', event.workspaceId]];
  const result: (readonly unknown[])[] = [['workspaces'], ['activity'], ['me']];
  if (event.projectId) result.push(['projects', event.projectId]);
  else result.push(['projects']);
  if (event.taskId) result.push(['tasks', event.taskId]);
  // Removal can unassign tasks in multiple projects and invalidate open task details.
  if (event.type.startsWith('member.') || event.type === 'workspace.deleted') result.push(['tasks'], ['chat', event.workspaceId]);
  return result;
}
