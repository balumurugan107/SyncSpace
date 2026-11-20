import { Router } from 'express';
import { authenticate, requireUser } from '../../shared/middleware/authenticate.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { uuidParam } from '../../shared/http/params.js';
import { activityQuery } from '../activity/activity.routes.js';
import { activityRepository } from '../activity/activity.repository.js';
import { moveTaskSchema, updateTaskSchema, type MoveTaskInput, type UpdateTaskInput } from './task.schemas.js';
import { taskService } from './task.service.js';

/** /api/tasks/:taskId — a task is addressed directly once you have its id. */
export const taskRouter = Router();
taskRouter.use(authenticate);

taskRouter.get('/:taskId', async (req, res) => {
  res.json({ task: await taskService.get(uuidParam(req, 'taskId'), requireUser(req.user).id) });
});

taskRouter.patch('/:taskId', validateBody(updateTaskSchema), async (req, res) => {
  const task = await taskService.update(uuidParam(req, 'taskId'), requireUser(req.user).id, req.body as UpdateTaskInput);
  res.json({ task });
});

taskRouter.post('/:taskId/move', validateBody(moveTaskSchema), async (req, res) => {
  const task = await taskService.move(uuidParam(req, 'taskId'), requireUser(req.user).id, req.body as MoveTaskInput);
  res.json({ task });
});

taskRouter.delete('/:taskId', async (req, res) => {
  await taskService.delete(uuidParam(req, 'taskId'), requireUser(req.user).id);
  res.status(204).end();
});

taskRouter.get('/:taskId/activity', async (req, res) => {
  const taskId = uuidParam(req, 'taskId');
  await taskService.get(taskId, requireUser(req.user).id); // access check
  res.json({ activity: await activityRepository.list({ kind: 'task', id: taskId }, activityQuery(req)) });
});
