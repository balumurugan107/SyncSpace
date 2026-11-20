import { pool, type Queryable } from '../../infrastructure/database/pool.js';
import type { WorkspaceRole } from '../workspaces/workspace-access.js';

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'COMPLETED';

export interface ProjectRecord {
  id: string;
  workspaceId: string;
  name: string;
  key: string;
  description: string;
}

export interface ProjectSummary extends ProjectRecord {
  workspaceName: string;
  /** The requesting user's role in the project's workspace. */
  role: WorkspaceRole;
  taskCounts: Record<TaskStatus, number>;
  createdAt: Date;
  updatedAt: Date;
}

const SUMMARY_SELECT = `
  SELECT p.id, p.workspace_id AS "workspaceId", p.name, p.key, p.description,
         w.name AS "workspaceName", m.role,
         json_build_object(
           'TODO',        count(t.id) FILTER (WHERE t.status = 'TODO'),
           'IN_PROGRESS', count(t.id) FILTER (WHERE t.status = 'IN_PROGRESS'),
           'IN_REVIEW',   count(t.id) FILTER (WHERE t.status = 'IN_REVIEW'),
           'COMPLETED',   count(t.id) FILTER (WHERE t.status = 'COMPLETED')
         ) AS "taskCounts",
         p.created_at AS "createdAt", p.updated_at AS "updatedAt"
    FROM projects p
    JOIN workspaces w        ON w.id = p.workspace_id
    JOIN workspace_members m ON m.workspace_id = p.workspace_id AND m.user_id = $1
    LEFT JOIN tasks t        ON t.project_id = p.id`;

const GROUP = 'GROUP BY p.id, w.name, m.role';

export const projectRepository = {
  async findById(id: string, db: Queryable = pool): Promise<ProjectRecord | null> {
    const { rows } = await db.query<ProjectRecord>(
      `SELECT id, workspace_id AS "workspaceId", name, key, description FROM projects WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  },

  /** Only returns the project if the user is a member of its workspace. */
  async findSummaryForUser(id: string, userId: string, db: Queryable = pool): Promise<ProjectSummary | null> {
    const { rows } = await db.query<ProjectSummary>(`${SUMMARY_SELECT} WHERE p.id = $2 ${GROUP}`, [userId, id]);
    return rows[0] ?? null;
  },

  async listForWorkspace(workspaceId: string, userId: string, db: Queryable = pool): Promise<ProjectSummary[]> {
    const { rows } = await db.query<ProjectSummary>(
      `${SUMMARY_SELECT} WHERE p.workspace_id = $2 ${GROUP} ORDER BY lower(p.name)`,
      [userId, workspaceId],
    );
    return rows;
  },

  async listForUser(userId: string, db: Queryable = pool): Promise<ProjectSummary[]> {
    const { rows } = await db.query<ProjectSummary>(`${SUMMARY_SELECT} ${GROUP} ORDER BY lower(w.name), lower(p.name)`, [
      userId,
    ]);
    return rows;
  },

  async insert(
    input: { workspaceId: string; name: string; key: string; description: string; createdBy: string },
    db: Queryable,
  ): Promise<{ id: string }> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO projects (workspace_id, name, key, description, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [input.workspaceId, input.name, input.key, input.description, input.createdBy],
    );
    return rows[0]!;
  },

  async update(id: string, input: { name?: string | undefined; description?: string | undefined }, db: Queryable): Promise<void> {
    await db.query(
      `UPDATE projects SET name = COALESCE($2, name), description = COALESCE($3, description), updated_at = now()
        WHERE id = $1`,
      [id, input.name ?? null, input.description ?? null],
    );
  },

  async delete(id: string, db: Queryable): Promise<void> {
    await db.query('DELETE FROM projects WHERE id = $1', [id]);
  },

  /**
   * Hands out the next task number. The UPDATE takes a row lock on the project that
   * is held until the transaction ends, which also serialises concurrent board moves.
   */
  async nextTaskNumber(id: string, db: Queryable): Promise<number> {
    const { rows } = await db.query<{ taskCounter: number }>(
      'UPDATE projects SET task_counter = task_counter + 1 WHERE id = $1 RETURNING task_counter AS "taskCounter"',
      [id],
    );
    return rows[0]!.taskCounter;
  },

  /**
   * Row-locks the project for the rest of the transaction (serialises writes on one board).
   * NO KEY UPDATE, not UPDATE: it conflicts with other board writers but not with the
   * KEY SHARE locks PostgreSQL takes for foreign-key checks (e.g. inserting an
   * activity row that references this project), which avoids deadlocks.
   */
  async lock(id: string, db: Queryable): Promise<void> {
    await db.query('SELECT 1 FROM projects WHERE id = $1 FOR NO KEY UPDATE', [id]);
  },
};
