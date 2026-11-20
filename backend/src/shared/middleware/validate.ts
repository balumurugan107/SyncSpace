import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { Errors } from '../errors/app-error.js';

/**
 * Validates and normalises `req.body` against a Zod schema. Unknown fields are
 * stripped, and on failure a 400 with per-field messages is returned.
 */
export function validateBody<Schema extends z.ZodType>(schema: Schema): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      return next(
        Errors.validation(
          result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
        ),
      );
    }
    req.body = result.data;
    next();
  };
}
