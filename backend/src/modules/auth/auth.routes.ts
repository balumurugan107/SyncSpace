import { Router, type Request, type Response } from 'express';
import { config } from '../../config/env.js';
import { rateLimit } from '../../infrastructure/rate-limit/rate-limit.js';
import { authenticate, requireUser } from '../../shared/middleware/authenticate.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { REFRESH_COOKIE_NAME, clearRefreshCookie, setRefreshCookie } from './auth.cookies.js';
import { loginSchema, registerSchema, type LoginInput, type RegisterInput } from './auth.schemas.js';
import { authService, type AuthSession, type ClientMeta } from './auth.service.js';
import { refreshTokenRepository } from './refresh-token.repository.js';

/**
 * Brute-force protection for credential endpoints, counted in Redis so the limit is
 * shared by every API instance behind the load balancer (Phase 1 kept it in memory,
 * which let a client get N x the limit with N instances).
 */
const credentialRateLimit = rateLimit({
  name: 'auth',
  limit: config.AUTH_RATE_LIMIT_MAX,
  windowMs: config.AUTH_RATE_LIMIT_WINDOW_MS,
});

function clientMeta(req: Request): ClientMeta {
  return { userAgent: req.get('user-agent'), ipAddress: req.ip };
}

function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE_NAME];
  return typeof value === 'string' ? value : undefined;
}

/** The refresh token goes into the httpOnly cookie, never into the JSON body. */
function sendSession(res: Response, session: AuthSession, status = 200): void {
  setRefreshCookie(res, session.refreshToken, session.refreshTokenExpiresAt);
  res.status(status).json({
    user: session.user,
    accessToken: session.accessToken,
    expiresIn: session.accessTokenExpiresIn,
  });
}

export const authRouter = Router();

authRouter.post('/register', credentialRateLimit, validateBody(registerSchema), async (req, res) => {
  const session = await authService.register(req.body as RegisterInput, clientMeta(req));
  req.log.info({ userId: session.user.id }, 'User registered');
  sendSession(res, session, 201);
});

authRouter.post('/login', credentialRateLimit, validateBody(loginSchema), async (req, res) => {
  const session = await authService.login(req.body as LoginInput, clientMeta(req));
  req.log.info({ userId: session.user.id }, 'User logged in');
  sendSession(res, session);
});

authRouter.post('/refresh', async (req, res) => {
  try {
    sendSession(res, await authService.refresh(readRefreshCookie(req), clientMeta(req)));
  } catch (error) {
    // A stale token means the browser already has a newer cookie: don't clear it.
    if ((error as { code?: string }).code !== 'REFRESH_TOKEN_STALE') clearRefreshCookie(res);
    throw error;
  }
});

authRouter.post('/logout', async (req, res) => {
  await authService.logout(readRefreshCookie(req));
  clearRefreshCookie(res);
  res.status(204).end();
});

authRouter.post('/logout-all', authenticate, async (req, res) => {
  const { id } = requireUser(req.user);
  const revoked = await authService.logoutAll(id);
  req.log.info({ userId: id, revoked }, 'User signed out of all sessions');
  clearRefreshCookie(res);
  res.status(204).end();
});

/** Active sign-ins (one per refresh-token family), marking the one making this request. */
authRouter.get('/sessions', authenticate, async (req, res) => {
  const { id } = requireUser(req.user);
  const [sessions, currentFamilyId] = await Promise.all([
    refreshTokenRepository.listActiveSessions(id),
    refreshTokenRepository.findFamilyIdByRawToken(readRefreshCookie(req)),
  ]);
  res.json({
    sessions: sessions.map((session) => ({ ...session, current: session.familyId === currentFamilyId })),
  });
});
