import { Router } from 'express';
import { pool } from '../../infrastructure/database/pool.js';
import { Errors } from '../../shared/errors/app-error.js';
import { authenticate, requireUser } from '../../shared/middleware/authenticate.js';
import { activityRepository } from '../activity/activity.repository.js';
import { myTasksQuerySchema } from '../tasks/task.schemas.js';
import { taskService } from '../tasks/task.service.js';

/** /api/me: views across every workspace the signed-in user belongs to. */
export const meRouter = Router();
meRouter.use(authenticate);

meRouter.get('/tasks', async (req, res) => {
  const query = myTasksQuerySchema.safeParse(req.query);
  if (!query.success) {
    throw Errors.validation(query.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })));
  }
  res.json({ tasks: await taskService.listAssignedTo(requireUser(req.user).id, query.data.scope) });
});

interface DashboardCounts {
  workspaceCount: number;
  projectCount: number;
  assignedOpen: number;
  overdue: number;
  dueThisWeek: number;
  completedLast7Days: number;
  byStatus: Record<string, number>;
}

meRouter.get('/dashboard', async (req, res) => {
  const userId = requireUser(req.user).id;
  // One round trip. Every count is restricted to workspaces the user belongs to.
  const { rows } = await pool.query<DashboardCounts>(
    `WITH my_ws AS (SELECT workspace_id FROM workspace_members WHERE user_id = $1),
          mine  AS (SELECT t.* FROM tasks t WHERE t.assignee_id = $1 AND t.workspace_id IN (SELECT workspace_id FROM my_ws))
     SELECT (SELECT count(*)::int FROM my_ws) AS "workspaceCount",
            (SELECT count(*)::int FROM projects WHERE workspace_id IN (SELECT workspace_id FROM my_ws)) AS "projectCount",
            (SELECT count(*)::int FROM mine WHERE status <> 'COMPLETED') AS "assignedOpen",
            (SELECT count(*)::int FROM mine WHERE status <> 'COMPLETED' AND due_date < current_date) AS "overdue",
            (SELECT count(*)::int FROM mine WHERE status <> 'COMPLETED'
                AND due_date BETWEEN current_date AND current_date + 7) AS "dueThisWeek",
            (SELECT count(*)::int FROM mine WHERE completed_at > now() - interval '7 days') AS "completedLast7Days",
            json_build_object(
              'TODO',        (SELECT count(*) FROM mine WHERE status = 'TODO'),
              'IN_PROGRESS', (SELECT count(*) FROM mine WHERE status = 'IN_PROGRESS'),
              'IN_REVIEW',   (SELECT count(*) FROM mine WHERE status = 'IN_REVIEW'),
              'COMPLETED',   (SELECT count(*) FROM mine WHERE status = 'COMPLETED')
            ) AS "byStatus"`,
    [userId],
  );
  const recentActivity = await activityRepository.list({ kind: 'user', id: userId }, { limit: 12 });
  res.json({ summary: rows[0], recentActivity });
});
