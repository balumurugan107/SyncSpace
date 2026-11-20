import { Router } from 'express';
import { authenticate, requireUser } from '../../shared/middleware/authenticate.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { uuidParam } from '../../shared/http/params.js';
import { activityQuery } from '../activity/activity.routes.js';
import { activityRepository } from '../activity/activity.repository.js';
import { projectService } from '../projects/project.service.js';
import { createProjectSchema, type CreateProjectInput } from '../projects/project.schemas.js';
import { requireWorkspaceRole } from './workspace-access.js';
import {
  addMemberSchema,
  createWorkspaceSchema,
  updateMemberSchema,
  updateWorkspaceSchema,
  type AddMemberInput,
  type CreateWorkspaceInput,
  type UpdateMemberInput,
  type UpdateWorkspaceInput,
} from './workspace.schemas.js';
import { workspaceService } from './workspace.service.js';

export const workspaceRouter = Router();
workspaceRouter.use(authenticate);

workspaceRouter.get('/', async (req, res) => {
  res.json({ workspaces: await workspaceService.list(requireUser(req.user).id) });
});

workspaceRouter.post('/', validateBody(createWorkspaceSchema), async (req, res) => {
  const workspace = await workspaceService.create(requireUser(req.user).id, req.body as CreateWorkspaceInput);
  res.status(201).json({ workspace });
});

workspaceRouter.get('/:workspaceId', async (req, res) => {
  res.json({ workspace: await workspaceService.get(uuidParam(req, 'workspaceId'), requireUser(req.user).id) });
});

workspaceRouter.patch('/:workspaceId', validateBody(updateWorkspaceSchema), async (req, res) => {
  const workspace = await workspaceService.update(
    uuidParam(req, 'workspaceId'),
    requireUser(req.user).id,
    req.body as UpdateWorkspaceInput,
  );
  res.json({ workspace });
});

workspaceRouter.delete('/:workspaceId', async (req, res) => {
  await workspaceService.delete(uuidParam(req, 'workspaceId'), requireUser(req.user).id);
  res.status(204).end();
});

// ----- Members -----

workspaceRouter.get('/:workspaceId/members', async (req, res) => {
  const { value, status } = await workspaceService.listMembers(uuidParam(req, 'workspaceId'), requireUser(req.user).id);
  res.setHeader('x-cache', status);
  res.json({ members: value });
});

workspaceRouter.post('/:workspaceId/members', validateBody(addMemberSchema), async (req, res) => {
  const member = await workspaceService.addMember(
    uuidParam(req, 'workspaceId'),
    requireUser(req.user).id,
    req.body as AddMemberInput,
  );
  res.status(201).json({ member });
});

workspaceRouter.patch('/:workspaceId/members/:userId', validateBody(updateMemberSchema), async (req, res) => {
  const member = await workspaceService.updateMember(
    uuidParam(req, 'workspaceId'),
    requireUser(req.user).id,
    uuidParam(req, 'userId'),
    req.body as UpdateMemberInput,
  );
  res.json({ member });
});

workspaceRouter.delete('/:workspaceId/members/:userId', async (req, res) => {
  await workspaceService.removeMember(uuidParam(req, 'workspaceId'), requireUser(req.user).id, uuidParam(req, 'userId'));
  res.status(204).end();
});

// ----- Projects in a workspace -----

workspaceRouter.get('/:workspaceId/projects', async (req, res) => {
  res.json({ projects: await projectService.listForWorkspace(uuidParam(req, 'workspaceId'), requireUser(req.user).id) });
});

workspaceRouter.post('/:workspaceId/projects', validateBody(createProjectSchema), async (req, res) => {
  const project = await projectService.create(
    uuidParam(req, 'workspaceId'),
    requireUser(req.user).id,
    req.body as CreateProjectInput,
  );
  res.status(201).json({ project });
});

// ----- Activity -----

workspaceRouter.get('/:workspaceId/activity', async (req, res) => {
  const workspaceId = uuidParam(req, 'workspaceId');
  await requireWorkspaceRole(workspaceId, requireUser(req.user).id);
  res.json({ activity: await activityRepository.list({ kind: 'workspace', id: workspaceId }, activityQuery(req)) });
});
