import { pool, type Queryable } from '../../infrastructure/database/pool.js';
import type { TaskStatus } from '../projects/project.repository.js';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

interface UserRef {
  id: string;
  displayName: string;
  email: string;
}

/** What the API returns for a task. */
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
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

/** Bare row, used inside write transactions. */
export interface TaskRow {
  id: string;
  projectId: string;
  workspaceId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  reporterId: string | null;
  dueDate: string | null;
  position: number;
  version: number;
}

const TASK_SELECT = `
  SELECT t.id, t.project_id AS "projectId", t.workspace_id AS "workspaceId",
         p.key AS "projectKey", p.name AS "projectName", w.name AS "workspaceName",
         t.number, p.key || '-' || t.number AS key,
         t.title, t.description, t.status, t.priority,
         CASE WHEN a.id IS NULL THEN NULL
              ELSE json_build_object('id', a.id, 'displayName', a.display_name, 'email', a.email) END AS assignee,
         CASE WHEN r.id IS NULL THEN NULL
              ELSE json_build_object('id', r.id, 'displayName', r.display_name, 'email', r.email) END AS reporter,
         t.due_date AS "dueDate", t.position, t.version,
         t.created_at AS "createdAt", t.updated_at AS "updatedAt", t.completed_at AS "completedAt"
    FROM tasks t
    JOIN projects p   ON p.id = t.project_id
    JOIN workspaces w ON w.id = t.workspace_id
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN users r ON r.id = t.reporter_id`;

const ROW_COLUMNS = `
  id, project_id AS "projectId", workspace_id AS "workspaceId", title, description, status, priority,
  assignee_id AS "assigneeId", reporter_id AS "reporterId", due_date AS "dueDate", position, version`;

/** Open tasks first by urgency: overdue/soonest due date, then priority. */
const PRIORITY_ORDER = `CASE t.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END`;

export const taskRepository = {
  async findById(id: string, db: Queryable = pool): Promise<Task | null> {
    const { rows } = await db.query<Task>(`${TASK_SELECT} WHERE t.id = $1`, [id]);
    return rows[0] ?? null;
  },

  async findRowForUpdate(id: string, db: Queryable): Promise<TaskRow | null> {
    const { rows } = await db.query<TaskRow>(`SELECT ${ROW_COLUMNS} FROM tasks WHERE id = $1 FOR UPDATE`, [id]);
    return rows[0] ?? null;
  },

  async findRow(id: string, db: Queryable = pool): Promise<TaskRow | null> {
    const { rows } = await db.query<TaskRow>(`SELECT ${ROW_COLUMNS} FROM tasks WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  async listForProject(projectId: string, db: Queryable = pool): Promise<Task[]> {
    const { rows } = await db.query<Task>(
      `${TASK_SELECT} WHERE t.project_id = $1 ORDER BY t.status, t.position LIMIT 2000`,
      [projectId],
    );
    return rows;
  },

  async listAssignedTo(userId: string, scope: 'open' | 'all', db: Queryable = pool): Promise<Task[]> {
    const { rows } = await db.query<Task>(
      `${TASK_SELECT}
        WHERE t.assignee_id = $1
          AND ($2 = 'all' OR t.status <> 'COMPLETED')
          AND EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = t.workspace_id AND m.user_id = $1)
        ORDER BY (t.status = 'COMPLETED'), t.due_date ASC NULLS LAST, ${PRIORITY_ORDER}, t.created_at
        LIMIT 500`,
      [userId, scope],
    );
    return rows;
  },

  /** Positions of a column in order, excluding one task (the one being moved). */
  async columnPositions(projectId: string, status: TaskStatus, excludeId: string | null, db: Queryable) {
    const { rows } = await db.query<{ id: string; position: number }>(
      `SELECT id, position FROM tasks
        WHERE project_id = $1 AND status = $2 AND ($3::uuid IS NULL OR id <> $3)
        ORDER BY position, created_at`,
      [projectId, status, excludeId],
    );
    return rows;
  },

  async setPositions(updates: { id: string; position: number }[], db: Queryable): Promise<void> {
    if (updates.length === 0) return;
    await db.query(
      `UPDATE tasks AS t SET position = u.position
         FROM unnest($1::uuid[], $2::float8[]) AS u(id, position)
        WHERE t.id = u.id`,
      [updates.map((u) => u.id), updates.map((u) => u.position)],
    );
  },

  async endOfColumn(projectId: string, status: TaskStatus, db: Queryable): Promise<number> {
    const { rows } = await db.query<{ max: number | null }>(
      'SELECT max(position) AS max FROM tasks WHERE project_id = $1 AND status = $2',
      [projectId, status],
    );
    return (rows[0]?.max ?? 0) + 1024;
  },

  async insert(
    input: {
      projectId: string;
      workspaceId: string;
      number: number;
      title: string;
      description: string;
      status: TaskStatus;
      priority: TaskPriority;
      assigneeId: string | null;
      reporterId: string;
      dueDate: string | null;
      position: number;
    },
    db: Queryable,
  ): Promise<{ id: string }> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO tasks (project_id, workspace_id, number, title, description, status, priority,
                          assignee_id, reporter_id, due_date, position, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CASE WHEN $6 = 'COMPLETED' THEN now() END)
       RETURNING id`,
      [
        input.projectId,
        input.workspaceId,
        input.number,
        input.title,
        input.description,
        input.status,
        input.priority,
        input.assigneeId,
        input.reporterId,
        input.dueDate,
        input.position,
      ],
    );
    return rows[0]!;
  },

  /** Writes the full new state and bumps the version. */
  async update(row: TaskRow, db: Queryable): Promise<void> {
    await db.query(
      `UPDATE tasks
          SET title = $2, description = $3, status = $4, priority = $5, assignee_id = $6, due_date = $7,
              position = $8, version = version + 1, updated_at = now(),
              completed_at = CASE
                WHEN $4 = 'COMPLETED' AND status <> 'COMPLETED' THEN now()
                WHEN $4 <> 'COMPLETED' THEN NULL
                ELSE completed_at END
        WHERE id = $1`,
      [row.id, row.title, row.description, row.status, row.priority, row.assigneeId, row.dueDate, row.position],
    );
  },

  async delete(id: string, db: Queryable): Promise<void> {
    await db.query('DELETE FROM tasks WHERE id = $1', [id]);
  },
};
