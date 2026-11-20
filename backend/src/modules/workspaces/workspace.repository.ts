import { pool, type Queryable } from '../../infrastructure/database/pool.js';
import type { WorkspaceRole } from './workspace-access.js';

export interface WorkspaceSummary {
  id: string;
  name: string;
  description: string;
  role: WorkspaceRole;
  memberCount: number;
  projectCount: number;
  openTaskCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceMember {
  userId: string;
  email: string;
  displayName: string;
  role: WorkspaceRole;
  joinedAt: Date;
}

/** Workspace row plus the *requesting user's* role and some counts. */
const SUMMARY_SELECT = `
  SELECT w.id, w.name, w.description, m.role,
         (SELECT count(*)::int FROM workspace_members x WHERE x.workspace_id = w.id) AS "memberCount",
         (SELECT count(*)::int FROM projects p WHERE p.workspace_id = w.id)          AS "projectCount",
         (SELECT count(*)::int FROM tasks t WHERE t.workspace_id = w.id AND t.status <> 'COMPLETED') AS "openTaskCount",
         w.created_at AS "createdAt", w.updated_at AS "updatedAt"
    FROM workspaces w
    JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = $1`;

export const workspaceRepository = {
  async listForUser(userId: string, db: Queryable = pool): Promise<WorkspaceSummary[]> {
    const { rows } = await db.query<WorkspaceSummary>(`${SUMMARY_SELECT} ORDER BY lower(w.name)`, [userId]);
    return rows;
  },

  async findForUser(workspaceId: string, userId: string, db: Queryable = pool): Promise<WorkspaceSummary | null> {
    const { rows } = await db.query<WorkspaceSummary>(`${SUMMARY_SELECT} WHERE w.id = $2`, [userId, workspaceId]);
    return rows[0] ?? null;
  },

  async insert(input: { name: string; description: string; createdBy: string }, db: Queryable): Promise<{ id: string }> {
    const { rows } = await db.query<{ id: string }>(
      'INSERT INTO workspaces (name, description, created_by) VALUES ($1, $2, $3) RETURNING id',
      [input.name, input.description, input.createdBy],
    );
    return rows[0]!;
  },

  async update(id: string, input: { name?: string | undefined; description?: string | undefined }, db: Queryable): Promise<void> {
    await db.query(
      `UPDATE workspaces
          SET name = COALESCE($2, name), description = COALESCE($3, description), updated_at = now()
        WHERE id = $1`,
      [id, input.name ?? null, input.description ?? null],
    );
  },

  async delete(id: string, db: Queryable = pool): Promise<void> {
    await db.query('DELETE FROM workspaces WHERE id = $1', [id]);
  },

  async listMembers(workspaceId: string, db: Queryable = pool): Promise<WorkspaceMember[]> {
    const { rows } = await db.query<WorkspaceMember>(
      `SELECT u.id AS "userId", u.email, u.display_name AS "displayName", m.role, m.joined_at AS "joinedAt"
         FROM workspace_members m JOIN users u ON u.id = m.user_id
        WHERE m.workspace_id = $1
        ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, lower(u.display_name)`,
      [workspaceId],
    );
    return rows;
  },

  async findMember(workspaceId: string, userId: string, db: Queryable = pool): Promise<WorkspaceMember | null> {
    const { rows } = await db.query<WorkspaceMember>(
      `SELECT u.id AS "userId", u.email, u.display_name AS "displayName", m.role, m.joined_at AS "joinedAt"
         FROM workspace_members m JOIN users u ON u.id = m.user_id
        WHERE m.workspace_id = $1 AND m.user_id = $2`,
      [workspaceId, userId],
    );
    return rows[0] ?? null;
  },

  async addMember(workspaceId: string, userId: string, role: WorkspaceRole, db: Queryable): Promise<void> {
    await db.query('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)', [
      workspaceId,
      userId,
      role,
    ]);
  },

  async setRole(workspaceId: string, userId: string, role: WorkspaceRole, db: Queryable): Promise<void> {
    await db.query('UPDATE workspace_members SET role = $3 WHERE workspace_id = $1 AND user_id = $2', [
      workspaceId,
      userId,
      role,
    ]);
  },

  /** Removes the membership and unassigns the user's tasks in that workspace (assignees must be members). */
  async removeMember(workspaceId: string, userId: string, db: Queryable): Promise<void> {
    await db.query(
      `UPDATE tasks SET assignee_id = NULL, version = version + 1, updated_at = now()
        WHERE workspace_id = $1 AND assignee_id = $2`,
      [workspaceId, userId],
    );
    await db.query('DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [workspaceId, userId]);
  },
};
