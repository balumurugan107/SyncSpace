import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireUser } from '../../shared/middleware/authenticate.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { Errors } from '../../shared/errors/app-error.js';
import { invalidate } from '../../shared/after-commit.js';
import { toPublicUser, userRepository } from './user.repository.js';

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1, 'Display name is required').max(80, 'Display name is too long'),
});

export const userRouter = Router();

userRouter.use(authenticate);

userRouter.get('/me', async (req, res) => {
  const { id } = requireUser(req.user);
  const user = await userRepository.findById(id);
  if (!user) throw Errors.unauthorized('Account no longer exists');
  res.json({ user: toPublicUser(user) });
});

userRouter.patch('/me', validateBody(updateProfileSchema), async (req, res) => {
  const { id } = requireUser(req.user);
  const user = await userRepository.updateProfile(id, req.body as z.infer<typeof updateProfileSchema>);
  if (!user) throw Errors.unauthorized('Account no longer exists');
  // Display names appear in cached boards and member lists everywhere. Renames are rare,
  // so one global "users" generation is simpler than tracking every place a user appears.
  await invalidate(['users']);
  res.json({ user: toPublicUser(user) });
});
