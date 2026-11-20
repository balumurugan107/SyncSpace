import { Router } from 'express';
import { authenticate, requireUser } from '../../shared/middleware/authenticate.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { uuidParam } from '../../shared/http/params.js';
import { activityQuery } from '../activity/activity.routes.js';
import { activityRepository } from '../activity/activity.repository.js';
import { createTaskSchema, type CreateTaskInput } from '../tasks/task.schemas.js';
import { taskService } from '../tasks/task.service.js';
import { updateProjectSchema, type UpdateProjectInput } from './project.schemas.js';
import { projectService, requireProjectAccess } from './project.service.js';

/** /api/projects. Creating a project lives under /api/workspaces/:id/projects. */
export const projectRouter = Router();
projectRouter.use(authenticate);

projectRouter.get('/', async (req, res) => {
  res.json({ projects: await projectService.listForUser(requireUser(req.user).id) });
});

projectRouter.get('/:projectId', async (req, res) => {
  const { value, status } = await projectService.get(uuidParam(req, 'projectId'), requireUser(req.user).id);
  res.setHeader('x-cache', status);
  res.json({ project: value });
});

projectRouter.patch('/:projectId', validateBody(updateProjectSchema), async (req, res) => {
  const project = await projectService.update(
    uuidParam(req, 'projectId'),
    requireUser(req.user).id,
    req.body as UpdateProjectInput,
  );
  res.json({ project });
});

projectRouter.delete('/:projectId', async (req, res) => {
  await projectService.delete(uuidParam(req, 'projectId'), requireUser(req.user).id);
  res.status(204).end();
});

/** The Kanban board: every task of the project, ordered by column position. */
projectRouter.get('/:projectId/tasks', async (req, res) => {
  const { value, status } = await taskService.listForProject(uuidParam(req, 'projectId'), requireUser(req.user).id);
  res.setHeader('x-cache', status);
  res.json({ tasks: value });
});

projectRouter.post('/:projectId/tasks', validateBody(createTaskSchema), async (req, res) => {
  const task = await taskService.create(uuidParam(req, 'projectId'), requireUser(req.user).id, req.body as CreateTaskInput);
  res.status(201).json({ task });
});

projectRouter.get('/:projectId/activity', async (req, res) => {
  const projectId = uuidParam(req, 'projectId');
  await requireProjectAccess(projectId, requireUser(req.user).id);
  res.json({ activity: await activityRepository.list({ kind: 'project', id: projectId }, activityQuery(req)) });
});
