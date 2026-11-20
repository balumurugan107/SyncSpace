import { pool, type Queryable } from '../../infrastructure/database/pool.js';

export type ActivityAction =
  | 'workspace.created'
  | 'workspace.updated'
  | 'member.added'
  | 'member.role_changed'
  | 'member.removed'
  | 'member.left'
  | 'project.created'
  | 'project.updated'
  | 'project.deleted'
  | 'task.created'
  | 'task.updated'
  | 'task.status_changed'
  | 'task.assigned'
  | 'task.deleted';

export interface ActivityInput {
  workspaceId: string;
  projectId?: string | null;
  taskId?: string | null;
  actorId: string;
  action: ActivityAction;
  entityTitle: string;
  metadata?: Record<string, unknown>;
}

export interface ActivityEntry {
  id: string;
  action: ActivityAction;
  workspaceId: string;
  workspaceName: string;
  projectId: string | null;
  projectName: string | null;
  projectKey: string | null;
  taskId: string | null;
  entityTitle: string;
  metadata: Record<string, unknown>;
  actor: { id: string; displayName: string } | null;
  createdAt: Date;
}

const SELECT = `
  SELECT a.id::text            AS id,
         a.action,
         a.workspace_id        AS "workspaceId",
         w.name                AS "workspaceName",
         a.project_id          AS "projectId",
         p.name                AS "projectName",
         p.key                 AS "projectKey",
         a.task_id             AS "taskId",
         a.entity_title        AS "entityTitle",
         a.metadata,
         CASE WHEN u.id IS NULL THEN NULL
              ELSE json_build_object('id', u.id, 'displayName', u.display_name) END AS actor,
         a.created_at          AS "createdAt"
    FROM activity_logs a
    JOIN workspaces w ON w.id = a.workspace_id
    LEFT JOIN projects p ON p.id = a.project_id
    LEFT JOIN users u ON u.id = a.actor_id`;

export type ActivityScope =
  | { kind: 'workspace'; id: string }
  | { kind: 'project'; id: string }
  | { kind: 'task'; id: string }
  | { kind: 'user'; id: string }; // everything in every workspace the user belongs to

const SCOPE_FILTER: Record<ActivityScope['kind'], string> = {
  workspace: 'a.workspace_id = $1',
  project: 'a.project_id = $1',
  task: 'a.task_id = $1',
  user: 'a.workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = $1)',
};

export const activityRepository = {
  /**
   * Always called with the transaction that made the change, so the history row
   * exists if and only if the change committed. (Phase 5 moves fan-out work such as
   * notifications to RabbitMQ; the history row itself stays transactional.)
   */
  async record(input: ActivityInput, db: Queryable): Promise<void> {
    await db.query(
      `INSERT INTO activity_logs (workspace_id, project_id, task_id, actor_id, action, entity_title, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.workspaceId,
        input.projectId ?? null,
        input.taskId ?? null,
        input.actorId,
        input.action,
        input.entityTitle,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  },

  /** Newest first, keyset-paginated with `before` (an activity id). */
  async list(scope: ActivityScope, options: { limit: number; before?: string | undefined }, db: Queryable = pool): Promise<ActivityEntry[]> {
    const params: unknown[] = [scope.id, options.limit];
    let cursor = '';
    if (options.before) {
      params.push(options.before);
      cursor = 'AND a.id < $3';
    }
    const { rows } = await db.query<ActivityEntry>(
      `${SELECT} WHERE ${SCOPE_FILTER[scope.kind]} ${cursor} ORDER BY a.id DESC LIMIT $2`,
      params,
    );
    return rows;
  },
};
