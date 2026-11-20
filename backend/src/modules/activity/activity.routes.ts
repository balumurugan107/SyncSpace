import type { Request } from 'express';
import { z } from 'zod';
import { Errors } from '../../shared/errors/app-error.js';

const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  before: z
    .string()
    .regex(/^\d{1,18}$/, 'before must be an activity id')
    .optional(),
});

/** Parses ?limit=&before= shared by every activity endpoint. */
export function activityQuery(req: Request): { limit: number; before?: string | undefined } {
  const parsed = activityQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw Errors.validation(parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })));
  }
  return parsed.data;
}
