import { Router } from 'express';
import { authenticate, requireUser } from '../../shared/middleware/authenticate.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { uuidParam } from '../../shared/http/params.js';
import { Errors } from '../../shared/errors/app-error.js';
import { chatService, historySchema, sendMessageSchema } from './chat.service.js';
import { requireWorkspaceRole } from '../workspaces/workspace-access.js';
import { presence } from '../../infrastructure/realtime/presence.js';

export const chatRouter = Router();
chatRouter.use(authenticate);
chatRouter.get('/:workspaceId/messages', async (req, res) => {
  const parsed = historySchema.safeParse(req.query);
  if (!parsed.success) throw Errors.validation(parsed.error.issues);
  res.json(await chatService.list(uuidParam(req, 'workspaceId'), requireUser(req.user).id, parsed.data));
});
chatRouter.post('/:workspaceId/messages', validateBody(sendMessageSchema), async (req, res) => {
  res.status(201).json({ message: await chatService.send(uuidParam(req, 'workspaceId'), requireUser(req.user).id, sendMessageSchema.parse(req.body)) });
});
chatRouter.get('/:workspaceId/presence', async (req, res) => {
  const workspaceId = uuidParam(req, 'workspaceId');
  await requireWorkspaceRole(workspaceId, requireUser(req.user).id);
  try { res.json({ userIds: await presence.list(workspaceId), available: true }); }
  catch { res.json({ userIds: [], available: false }); }
});
