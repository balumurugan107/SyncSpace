import { pool, type Queryable } from '../../infrastructure/database/pool.js';
import { Errors } from '../../shared/errors/app-error.js';

export type WorkspaceRole = 'owner' | 'admin' | 'member';

const RANK: Record<WorkspaceRole, number> = { member: 1, admin: 2, owner: 3 };

export function hasRole(role: WorkspaceRole, minimum: WorkspaceRole): boolean {
  return RANK[role] >= RANK[minimum];
}

/**
 * The single authorisation gate for everything inside a workspace.
 *
 * - Not a member  -> 404, so outsiders cannot even learn the workspace exists.
 * - Member, but role too low -> 403.
 *
 * Projects and tasks resolve their workspace first and then call this, so there is
 * exactly one place where "who may touch what" is decided.
 */
export async function requireWorkspaceRole(
  workspaceId: string,
  userId: string,
  minimum: WorkspaceRole = 'member',
  db: Queryable = pool,
): Promise<WorkspaceRole> {
  const { rows } = await db.query<{ role: WorkspaceRole }>(
    'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
    [workspaceId, userId],
  );
  const role = rows[0]?.role;
  if (!role) throw Errors.notFound('Workspace not found');
  if (!hasRole(role, minimum)) {
    throw Errors.forbidden(`This action requires the ${minimum} role in this workspace`);
  }
  return role;
}

export async function isWorkspaceMember(workspaceId: string, userId: string, db: Queryable = pool): Promise<boolean> {
  const { rowCount } = await db.query('SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [
    workspaceId,
    userId,
  ]);
  return (rowCount ?? 0) > 0;
}
