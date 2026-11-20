import { cache, type Cached } from '../../infrastructure/cache/cache.js';
import { withTransaction, type Queryable } from '../../infrastructure/database/pool.js';
import { afterCommit } from '../../shared/after-commit.js';
import { AppError, Errors } from '../../shared/errors/app-error.js';
import { activityRepository, type ActivityInput } from '../activity/activity.repository.js';
import { projectRepository } from '../projects/project.repository.js';
import { requireProjectAccess } from '../projects/project.service.js';
import { userRepository } from '../users/user.repository.js';
import { hasRole, isWorkspaceMember, requireWorkspaceRole, type WorkspaceRole } from '../workspaces/workspace-access.js';
import { evenlySpaced, positionBetween } from './positioning.js';
import { taskRepository, type Task, type TaskRow } from './task.repository.js';
import type { CreateTaskInput, MoveTaskInput, UpdateTaskInput } from './task.schemas.js';

async function loadTask(taskId: string): Promise<Task> {
  const task = await taskRepository.findById(taskId);
  if (!task) throw Errors.notFound('Task not found');
  return task;
}

/** Loads and row-locks a task, then checks workspace membership. Outsiders get 404. */
async function lockTaskWithAccess(taskId: string, userId: string, db: Queryable): Promise<{ row: TaskRow; role: WorkspaceRole }> {
  const row = await taskRepository.findRowForUpdate(taskId, db);
  if (!row) throw Errors.notFound('Task not found');
  try {
    const role = await requireWorkspaceRole(row.workspaceId, userId, 'member', db);
    return { row, role };
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) throw Errors.notFound('Task not found');
    throw error;
  }
}

/**
 * Optimistic concurrency. If the client edited version 3 but the row is already at
 * version 4, someone else changed it in between: reject instead of overwriting.
 */
function assertVersion(row: TaskRow, expected: number | undefined): void {
  if (expected !== undefined && expected !== row.version) {
    throw new AppError(409, 'VERSION_CONFLICT', 'This task was changed by someone else. Reload to see the latest version.', {
      currentVersion: row.version,
    });
  }
}

async function assertAssignable(workspaceId: string, assigneeId: string | null | undefined, db: Queryable): Promise<void> {
  if (assigneeId && !(await isWorkspaceMember(workspaceId, assigneeId, db))) {
    throw Errors.validation([{ field: 'assigneeId', message: 'Assignee must be a member of this workspace' }]);
  }
}

/** Puts `taskId` right after `afterTaskId` (or at the top) of a column, re-spacing the column if needed. */
async function computePosition(
  projectId: string,
  status: TaskRow['status'],
  taskId: string,
  afterTaskId: string | null,
  db: Queryable,
): Promise<number> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const column = await taskRepository.columnPositions(projectId, status, taskId, db);
    let index = -1;
    if (afterTaskId) {
      index = column.findIndex((card) => card.id === afterTaskId);
      if (index === -1) {
        throw Errors.validation([{ field: 'afterTaskId', message: 'That task is not in the target column' }]);
      }
    }
    const before = index >= 0 ? column[index]!.position : null;
    const after = column[index + 1]?.position ?? null;
    const position = positionBetween(before, after);
    if (position !== null) return position;

    // Gap exhausted: re-space the whole column once, then compute again.
    const spaced = evenlySpaced(column.length);
    await taskRepository.setPositions(
      column.map((card, i) => ({ id: card.id, position: spaced[i]! })),
      db,
    );
  }
  throw new Error('Could not compute a task position after re-spacing the column');
}

async function displayName(userId: string | null, db: Queryable): Promise<string | null> {
  if (!userId) return null;
  return (await userRepository.findById(userId, db))?.displayName ?? null;
}

export const taskService = {
  /**
   * The board: the most frequently read data in the app (every board visit and every
   * window refocus). Authorisation always hits PostgreSQL; only the board data is
   * cached. It depends on the project (tasks, key, name), the workspace (its name,
   * assignees leaving) and users (assignee display names).
   */
  async listForProject(projectId: string, userId: string): Promise<Cached<Task[]>> {
    const { project } = await requireProjectAccess(projectId, userId);
    return cache.read(`board:${projectId}`, [`project:${projectId}`, `workspace:${project.workspaceId}`, 'users'], () =>
      taskRepository.listForProject(projectId),
    );
  },

  listAssignedTo: (userId: string, scope: 'open' | 'all') => taskRepository.listAssignedTo(userId, scope),

  async get(taskId: string, userId: string): Promise<Task> {
    const row = await taskRepository.findRow(taskId);
    if (!row || !(await isWorkspaceMember(row.workspaceId, userId))) throw Errors.notFound('Task not found');
    return loadTask(taskId);
  },

  async create(projectId: string, userId: string, input: CreateTaskInput): Promise<Task> {
    const { id, workspaceId } = await withTransaction(async (tx) => {
      const { project } = await requireProjectAccess(projectId, userId, 'member', tx);
      await assertAssignable(project.workspaceId, input.assigneeId, tx);
      // Locks the project row until commit: numbers are unique and gap-free per project.
      const number = await projectRepository.nextTaskNumber(projectId, tx);
      const position = await taskRepository.endOfColumn(projectId, input.status, tx);
      const task = await taskRepository.insert(
        { projectId, workspaceId: project.workspaceId, number, ...input, reporterId: userId, position },
        tx,
      );
      await activityRepository.record(
        {
          workspaceId: project.workspaceId,
          projectId,
          taskId: task.id,
          actorId: userId,
          action: 'task.created',
          entityTitle: input.title,
          metadata: { key: `${project.key}-${number}`, status: input.status },
        },
        tx,
      );
      if (input.assigneeId) {
        await activityRepository.record(
          {
            workspaceId: project.workspaceId,
            projectId,
            taskId: task.id,
            actorId: userId,
            action: 'task.assigned',
            entityTitle: input.title,
            metadata: { assigneeId: input.assigneeId, assigneeName: await displayName(input.assigneeId, tx) },
          },
          tx,
        );
      }
      return { id: task.id, workspaceId: project.workspaceId };
    });
    await afterCommit({ type: 'task.created', workspaceId, projectId, taskId: id, actorId: userId, scopes: [`project:${projectId}`] });
    return loadTask(id);
  },

  async update(taskId: string, userId: string, input: UpdateTaskInput): Promise<Task> {
    const changed = await withTransaction(async (tx): Promise<TaskRow | null> => {
      // Lock order is always project -> task (same as move), so the two can never deadlock.
      const existing = await taskRepository.findRow(taskId, tx);
      if (!existing) throw Errors.notFound('Task not found');
      await projectRepository.lock(existing.projectId, tx);

      const { row } = await lockTaskWithAccess(taskId, userId, tx);
      assertVersion(row, input.version);
      if (input.assigneeId !== undefined) await assertAssignable(row.workspaceId, input.assigneeId, tx);

      const next: TaskRow = {
        ...row,
        title: input.title ?? row.title,
        description: input.description ?? row.description,
        status: input.status ?? row.status,
        priority: input.priority ?? row.priority,
        assigneeId: input.assigneeId !== undefined ? input.assigneeId : row.assigneeId,
        dueDate: input.dueDate !== undefined ? input.dueDate : row.dueDate,
      };
      // Changing status through an edit (not a drag) puts the card at the bottom of its new column.
      if (next.status !== row.status) {
        next.position = await taskRepository.endOfColumn(row.projectId, next.status, tx);
      }

      const changed = (['title', 'description', 'priority', 'dueDate'] as const).filter((field) => next[field] !== row[field]);
      if (changed.length === 0 && next.status === row.status && next.assigneeId === row.assigneeId) return null;

      await taskRepository.update(next, tx);

      const base: Omit<ActivityInput, 'action'> = {
        workspaceId: row.workspaceId,
        projectId: row.projectId,
        taskId,
        actorId: userId,
        entityTitle: next.title,
      };
      if (next.status !== row.status) {
        await activityRepository.record({ ...base, action: 'task.status_changed', metadata: { from: row.status, to: next.status } }, tx);
      }
      if (next.assigneeId !== row.assigneeId) {
        await activityRepository.record(
          { ...base, action: 'task.assigned', metadata: { assigneeId: next.assigneeId, assigneeName: await displayName(next.assigneeId, tx) } },
          tx,
        );
      }
      if (changed.length > 0) {
        await activityRepository.record({ ...base, action: 'task.updated', metadata: { fields: changed } }, tx);
      }
      return row;
    });
    if (changed) {
      await afterCommit({
        type: 'task.updated',
        workspaceId: changed.workspaceId,
        projectId: changed.projectId,
        taskId,
        actorId: userId,
        scopes: [`project:${changed.projectId}`],
      });
    }
    return loadTask(taskId);
  },

  /**
   * Drag-and-drop on the board. The project row lock serialises concurrent moves on
   * the same board, so two people dropping cards into the same gap cannot compute
   * the same position from the same snapshot.
   */
  async move(taskId: string, userId: string, input: MoveTaskInput): Promise<Task> {
    const moved = await withTransaction(async (tx) => {
      const existing = await taskRepository.findRow(taskId, tx);
      if (!existing) throw Errors.notFound('Task not found');
      await projectRepository.lock(existing.projectId, tx);

      const { row } = await lockTaskWithAccess(taskId, userId, tx);
      assertVersion(row, input.version);
      if (input.afterTaskId === taskId) {
        throw Errors.validation([{ field: 'afterTaskId', message: 'A task cannot be placed after itself' }]);
      }

      const position = await computePosition(row.projectId, input.status, taskId, input.afterTaskId, tx);
      await taskRepository.update({ ...row, status: input.status, position }, tx);

      // Reordering within a column is not interesting history; a status change is.
      if (input.status !== row.status) {
        await activityRepository.record(
          {
            workspaceId: row.workspaceId,
            projectId: row.projectId,
            taskId,
            actorId: userId,
            action: 'task.status_changed',
            entityTitle: row.title,
            metadata: { from: row.status, to: input.status },
          },
          tx,
        );
      }
      return row;
    });
    await afterCommit({
      type: 'task.moved',
      workspaceId: moved.workspaceId,
      projectId: moved.projectId,
      taskId,
      actorId: userId,
      scopes: [`project:${moved.projectId}`],
    });
    return loadTask(taskId);
  },

  /** The reporter or a workspace admin/owner may delete a task. */
  async delete(taskId: string, userId: string): Promise<void> {
    const task = await taskRepository.findById(taskId);
    if (!task) throw Errors.notFound('Task not found');
    await withTransaction(async (tx) => {
      await projectRepository.lock(task.projectId, tx); // same project -> task lock order as move/update
      const { row, role } = await lockTaskWithAccess(taskId, userId, tx);
      if (row.reporterId !== userId && !hasRole(role, 'admin')) {
        throw Errors.forbidden('Only the task’s creator or a workspace admin can delete it');
      }
      await taskRepository.delete(taskId, tx);
      await activityRepository.record(
        {
          workspaceId: row.workspaceId,
          projectId: row.projectId,
          actorId: userId,
          action: 'task.deleted',
          entityTitle: row.title,
          metadata: { key: task.key },
        },
        tx,
      );
    });
    await afterCommit({
      type: 'task.deleted',
      workspaceId: task.workspaceId,
      projectId: task.projectId,
      taskId,
      actorId: userId,
      scopes: [`project:${task.projectId}`],
    });
  },
};
