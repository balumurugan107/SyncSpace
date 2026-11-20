import type { RequestHandler } from 'express';
import { Errors } from '../errors/app-error.js';
import { verifyAccessToken } from '../../modules/auth/token.service.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Verifies the `Authorization: Bearer <jwt>` header. Verification is purely
 * cryptographic (no database call), which keeps authenticated requests cheap and
 * lets any API instance validate any token.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(Errors.unauthorized());
  }
  try {
    req.user = await verifyAccessToken(header.slice('Bearer '.length));
    next();
  } catch (error) {
    next(error);
  }
};

/** Narrows `req.user` for handlers mounted behind `authenticate`. */
export function requireUser(user: AuthenticatedUser | undefined): AuthenticatedUser {
  if (!user) throw Errors.unauthorized();
  return user;
}
