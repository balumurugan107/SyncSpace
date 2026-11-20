import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, errors as joseErrors, jwtVerify } from 'jose';
import { config } from '../../config/env.js';
import { Errors } from '../../shared/errors/app-error.js';
import type { AuthenticatedUser } from '../../shared/middleware/authenticate.js';

/**
 * Two kinds of tokens:
 *
 * 1. Access token: a short-lived JWT (default 15 min) signed with HS256. Sent as
 *    `Authorization: Bearer ...`. Stateless: any API instance can verify it without
 *    touching the database.
 * 2. Refresh token: 256 random bits, opaque, long-lived (default 7 days). Lives in an
 *    httpOnly cookie that JavaScript cannot read. Only its SHA-256 hash is stored in
 *    PostgreSQL, so it can be revoked server-side.
 */
const accessSecret = new TextEncoder().encode(config.JWT_ACCESS_SECRET);
const AUDIENCE = 'syncspace-web';

export async function signAccessToken(user: AuthenticatedUser): Promise<string> {
  return new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setIssuer(config.JWT_ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${config.JWT_ACCESS_TTL_SECONDS}s`)
    .sign(accessSecret);
}

export async function verifyAccessToken(token: string): Promise<AuthenticatedUser> {
  try {
    const { payload } = await jwtVerify(token, accessSecret, {
      issuer: config.JWT_ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
      throw Errors.unauthorized('Invalid access token', 'INVALID_TOKEN');
    }
    return { id: payload.sub, email: payload.email };
  } catch (error) {
    if (error instanceof joseErrors.JWTExpired) {
      // The client reacts to this specific code by calling /auth/refresh and retrying.
      throw Errors.unauthorized('Access token expired', 'TOKEN_EXPIRED');
    }
    throw Errors.unauthorized('Invalid access token', 'INVALID_TOKEN');
  }
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function refreshTokenExpiry(from = new Date()): Date {
  return new Date(from.getTime() + config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}
