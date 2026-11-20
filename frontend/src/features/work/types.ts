export type WorkspaceRole = 'owner' | 'admin' | 'member';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'COMPLETED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export const TASK_STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED'];
export const TASK_PRIORITIES: TaskPriority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];

export interface Workspace {
  id: string;
  name: string;
  description: string;
  role: WorkspaceRole;
  memberCount: number;
  projectCount: number;
  openTaskCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Member {
  userId: string;
  email: string;
  displayName: string;
  role: WorkspaceRole;
  joinedAt: string;
}

export interface Project {
  id: string;
  workspaceId: string;
  workspaceName: string;
  name: string;
  key: string;
  description: string;
  role: WorkspaceRole;
  taskCounts: Record<TaskStatus, number>;
  createdAt: string;
  updatedAt: string;
}

export interface UserRef {
  id: string;
  displayName: string;
  email: string;
}

export interface Task {
  id: string;
  projectId: string;
  workspaceId: string;
  projectKey: string;
  projectName: string;
  workspaceName: string;
  number: number;
  key: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: UserRef | null;
  reporter: UserRef | null;
  dueDate: string | null;
  position: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface ActivityEntry {
  id: string;
  action: string;
  workspaceId: string;
  workspaceName: string;
  projectId: string | null;
  projectName: string | null;
  projectKey: string | null;
  taskId: string | null;
  entityTitle: string;
  metadata: Record<string, unknown>;
  actor: { id: string; displayName: string } | null;
  createdAt: string;
}

export interface DashboardSummary {
  workspaceCount: number;
  projectCount: number;
  assignedOpen: number;
  overdue: number;
  dueThisWeek: number;
  completedLast7Days: number;
  byStatus: Record<TaskStatus, number>;
}

export type TaskUpdate = Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'dueDate'>> & {
  assigneeId?: string | null;
};

export interface NewTask {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string | null;
  dueDate?: string | null;
}
