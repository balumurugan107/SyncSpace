import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { applyMove } from '@/features/board/board-logic';
import { api, ApiError } from '@/lib/api-client';
import type {
  ActivityEntry,
  DashboardSummary,
  Member,
  NewTask,
  Project,
  Task,
  TaskStatus,
  TaskUpdate,
  Workspace,
  WorkspaceRole,
} from './types';

/**
 * Query keys are hierarchical so one invalidation can refresh a whole family,
 * e.g. invalidating ['projects'] refreshes every project list and detail.
 */
export const keys = {
  workspaces: ['workspaces'] as const,
  workspace: (id: string) => ['workspaces', id] as const,
  members: (workspaceId: string) => ['workspaces', workspaceId, 'members'] as const,
  workspaceProjects: (workspaceId: string) => ['workspaces', workspaceId, 'projects'] as const,
  projects: ['projects'] as const,
  project: (id: string) => ['projects', id] as const,
  board: (projectId: string) => ['projects', projectId, 'tasks'] as const,
  task: (id: string) => ['tasks', id] as const,
  activity: (scope: ActivityScope, id: string) => ['activity', scope, id] as const,
  myTasks: (scope: 'open' | 'all') => ['me', 'tasks', scope] as const,
  dashboard: ['me', 'dashboard'] as const,
};

export type ActivityScope = 'workspaces' | 'projects' | 'tasks';

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const useWorkspaces = () =>
  useQuery({ queryKey: keys.workspaces, queryFn: () => api.get<{ workspaces: Workspace[] }>('/workspaces').then((r) => r.workspaces) });

export const useWorkspace = (id: string) =>
  useQuery({ queryKey: keys.workspace(id), queryFn: () => api.get<{ workspace: Workspace }>(`/workspaces/${id}`).then((r) => r.workspace) });

export const useMembers = (workspaceId: string | undefined) =>
  useQuery({
    queryKey: keys.members(workspaceId ?? ''),
    queryFn: () => api.get<{ members: Member[] }>(`/workspaces/${workspaceId}/members`).then((r) => r.members),
    enabled: Boolean(workspaceId),
  });

export const useWorkspaceProjects = (workspaceId: string) =>
  useQuery({
    queryKey: keys.workspaceProjects(workspaceId),
    queryFn: () => api.get<{ projects: Project[] }>(`/workspaces/${workspaceId}/projects`).then((r) => r.projects),
  });

export const useProjects = () =>
  useQuery({ queryKey: keys.projects, queryFn: () => api.get<{ projects: Project[] }>('/projects').then((r) => r.projects) });

export const useProject = (id: string) =>
  useQuery({ queryKey: keys.project(id), queryFn: () => api.get<{ project: Project }>(`/projects/${id}`).then((r) => r.project) });

export const useBoard = (projectId: string) =>
  useQuery({
    queryKey: keys.board(projectId),
    queryFn: () => api.get<{ tasks: Task[] }>(`/projects/${projectId}/tasks`).then((r) => r.tasks),
  });

export const useTask = (id: string | null) =>
  useQuery({
    queryKey: keys.task(id ?? ''),
    queryFn: () => api.get<{ task: Task }>(`/tasks/${id}`).then((r) => r.task),
    enabled: Boolean(id),
  });

export const useActivity = (scope: ActivityScope, id: string, limit = 30) =>
  useQuery({
    queryKey: [...keys.activity(scope, id), limit],
    queryFn: () => api.get<{ activity: ActivityEntry[] }>(`/${scope}/${id}/activity?limit=${limit}`).then((r) => r.activity),
  });

export const useMyTasks = (scope: 'open' | 'all') =>
  useQuery({ queryKey: keys.myTasks(scope), queryFn: () => api.get<{ tasks: Task[] }>(`/me/tasks?scope=${scope}`).then((r) => r.tasks) });

export const useDashboard = () =>
  useQuery({
    queryKey: keys.dashboard,
    queryFn: () => api.get<{ summary: DashboardSummary; recentActivity: ActivityEntry[] }>('/me/dashboard'),
  });

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const fields = Object.values(error.fieldErrors);
    return fields.length ? fields.join(' · ') : error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong';
}

/** After any write, refresh everything that may show the changed data. */
function invalidateWork(client: QueryClient): Promise<unknown> {
  return Promise.all([
    client.invalidateQueries({ queryKey: keys.workspaces }),
    client.invalidateQueries({ queryKey: keys.projects }),
    client.invalidateQueries({ queryKey: ['tasks'] }),
    client.invalidateQueries({ queryKey: ['activity'] }),
    client.invalidateQueries({ queryKey: ['me'] }),
  ]);
}

function useWorkMutation<TVariables, TResult>(fn: (variables: TVariables) => Promise<TResult>) {
  const client = useQueryClient();
  // onSettled (not onSuccess): after a 409 conflict the stale copy must be refetched too.
  return useMutation({ mutationFn: fn, onSettled: () => invalidateWork(client) });
}

export const useCreateWorkspace = () =>
  useWorkMutation((input: { name: string; description: string }) =>
    api.post<{ workspace: Workspace }>('/workspaces', input).then((r) => r.workspace),
  );

export const useUpdateWorkspace = (id: string) =>
  useWorkMutation((input: { name?: string; description?: string }) =>
    api.patch<{ workspace: Workspace }>(`/workspaces/${id}`, input).then((r) => r.workspace),
  );

export const useDeleteWorkspace = () => useWorkMutation((id: string) => api.delete(`/workspaces/${id}`));

export const useAddMember = (workspaceId: string) =>
  useWorkMutation((input: { email: string; role: Exclude<WorkspaceRole, 'owner'> }) =>
    api.post<{ member: Member }>(`/workspaces/${workspaceId}/members`, input).then((r) => r.member),
  );

export const useUpdateMember = (workspaceId: string) =>
  useWorkMutation(({ userId, role }: { userId: string; role: Exclude<WorkspaceRole, 'owner'> }) =>
    api.patch(`/workspaces/${workspaceId}/members/${userId}`, { role }),
  );

export const useRemoveMember = (workspaceId: string) =>
  useWorkMutation((userId: string) => api.delete(`/workspaces/${workspaceId}/members/${userId}`));

export const useCreateProject = () =>
  useWorkMutation(({ workspaceId, ...input }: { workspaceId: string; name: string; key: string; description: string }) =>
    api.post<{ project: Project }>(`/workspaces/${workspaceId}/projects`, input).then((r) => r.project),
  );

export const useUpdateProject = (id: string) =>
  useWorkMutation((input: { name?: string; description?: string }) =>
    api.patch<{ project: Project }>(`/projects/${id}`, input).then((r) => r.project),
  );

export const useDeleteProject = () => useWorkMutation((id: string) => api.delete(`/projects/${id}`));

export const useCreateTask = (projectId: string) =>
  useWorkMutation((input: NewTask) => api.post<{ task: Task }>(`/projects/${projectId}/tasks`, input).then((r) => r.task));

/** Sends the version the user was looking at; a 409 means someone else changed the task first. */
export const useUpdateTask = () =>
  useWorkMutation(({ task, changes }: { task: Task; changes: TaskUpdate }) =>
    api.patch<{ task: Task }>(`/tasks/${task.id}`, { ...changes, version: task.version }).then((r) => r.task),
  );

export const useDeleteTask = () => useWorkMutation((id: string) => api.delete(`/tasks/${id}`));

/**
 * Drag-and-drop move with an optimistic update: the card stays where it was dropped
 * immediately, and is rolled back if the server rejects the move.
 */
export function useMoveTask(projectId: string) {
  const client = useQueryClient();
  const boardKey = keys.board(projectId);
  return useMutation({
    mutationFn: ({ task, status, afterTaskId }: { task: Task; status: TaskStatus; afterTaskId: string | null }) =>
      api.post<{ task: Task }>(`/tasks/${task.id}/move`, { status, afterTaskId, version: task.version }).then((r) => r.task),
    onMutate: async ({ task, status, afterTaskId }) => {
      await client.cancelQueries({ queryKey: boardKey });
      const previous = client.getQueryData<Task[]>(boardKey);
      if (previous) client.setQueryData(boardKey, applyMove(previous, task.id, status, afterTaskId));
      return { previous };
    },
    onSuccess: (saved) => {
      client.setQueryData<Task[]>(boardKey, (tasks) => tasks?.map((t) => (t.id === saved.id ? saved : t)));
    },
    onError: (error, _variables, context) => {
      if (context?.previous) client.setQueryData(boardKey, context.previous);
      toast.error(
        error instanceof ApiError && error.code === 'VERSION_CONFLICT'
          ? 'Someone else changed this task. The board has been refreshed.'
          : `Could not move the task: ${errorMessage(error)}`,
      );
    },
    onSettled: () => invalidateWork(client),
  });
}
