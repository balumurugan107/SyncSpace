import { randomUUID } from 'node:crypto';
import { config } from '../../config/env.js';
import { pool, withTransaction, type Queryable } from '../../infrastructure/database/pool.js';
import { AppError, Errors } from '../../shared/errors/app-error.js';
import { toPublicUser, userRepository, type PublicUser, type UserRecord } from '../users/user.repository.js';
import { getDummyHash, hashPassword, verifyPassword } from './password.js';
import { refreshTokenRepository } from './refresh-token.repository.js';
import { generateRefreshToken, refreshTokenExpiry, signAccessToken } from './token.service.js';
import type { LoginInput, RegisterInput } from './auth.schemas.js';

export interface ClientMeta {
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

export interface AuthSession {
  user: PublicUser;
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

const PG_UNIQUE_VIOLATION = '23505';

async function issueSession(
  user: UserRecord,
  familyId: string,
  meta: ClientMeta,
  db: Queryable = pool,
): Promise<{ session: AuthSession; tokenId: string }> {
  const refreshToken = generateRefreshToken();
  const refreshTokenExpiresAt = refreshTokenExpiry();
  const stored = await refreshTokenRepository.insert(
    { userId: user.id, familyId, rawToken: refreshToken, expiresAt: refreshTokenExpiresAt, ...meta },
    db,
  );
  const accessToken = await signAccessToken({ id: user.id, email: user.email });
  return {
    tokenId: stored.id,
    session: {
      user: toPublicUser(user),
      accessToken,
      accessTokenExpiresIn: config.JWT_ACCESS_TTL_SECONDS,
      refreshToken,
      refreshTokenExpiresAt,
    },
  };
}

export const authService = {
  async register(input: RegisterInput, meta: ClientMeta): Promise<AuthSession> {
    const passwordHash = await hashPassword(input.password);
    try {
      return await withTransaction(async (tx) => {
        const user = await userRepository.create(
          { email: input.email, passwordHash, displayName: input.displayName },
          tx,
        );
        const { session } = await issueSession(user, randomUUID(), meta, tx);
        return session;
      });
    } catch (error) {
      // The unique index is the source of truth; checking first would still race.
      if ((error as { code?: string }).code === PG_UNIQUE_VIOLATION) {
        throw Errors.conflict('An account with this email already exists', 'EMAIL_TAKEN');
      }
      throw error;
    }
  },

  async login(input: LoginInput, meta: ClientMeta): Promise<AuthSession> {
    const user = await userRepository.findByEmail(input.email);
    // Always run bcrypt, even for unknown emails, so response timing does not reveal which emails exist.
    const passwordMatches = await verifyPassword(input.password, user?.passwordHash ?? (await getDummyHash()));
    if (!user || !passwordMatches) {
      throw Errors.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    }
    const updated = (await userRepository.touchLastLogin(user.id)) ?? user;
    const { session } = await issueSession(updated, randomUUID(), meta);
    return session;
  },

  /**
   * Refresh-token rotation: every refresh consumes the presented token and issues a
   * new one in the same family.
   *
   * If an already-rotated token shows up again after the grace window, someone may
   * have stolen it. We cannot tell the attacker from the real user, so the whole
   * family (that login) is revoked and both must sign in again.
   */
  async refresh(rawToken: string | undefined, meta: ClientMeta): Promise<AuthSession> {
    if (!rawToken) throw Errors.unauthorized('No refresh token', 'INVALID_REFRESH_TOKEN');

    // The transaction returns either a session or the error to raise, so a family
    // revocation is COMMITTED before we answer 401 (throwing inside would roll it back).
    const outcome = await withTransaction<AuthSession | AppError>(async (tx) => {
      const token = await refreshTokenRepository.findByRawTokenForUpdate(rawToken, tx);
      if (!token) return Errors.unauthorized('Invalid refresh token', 'INVALID_REFRESH_TOKEN');

      if (token.revokedAt) {
        if (token.revokedReason === 'rotated') {
          const ageSeconds = (Date.now() - token.revokedAt.getTime()) / 1000;
          if (ageSeconds <= config.REFRESH_TOKEN_REUSE_GRACE_SECONDS) {
            // Benign race: two tabs refreshed at the same moment. The browser already
            // holds the newer cookie, so the client can simply retry once.
            return Errors.unauthorized('Refresh token was just rotated; retry', 'REFRESH_TOKEN_STALE');
          }
          await refreshTokenRepository.revokeFamily(token.familyId, 'reuse_detected', tx);
          return Errors.unauthorized('Refresh token reuse detected; please sign in again', 'REFRESH_TOKEN_REUSED');
        }
        return Errors.unauthorized('Session has ended', 'INVALID_REFRESH_TOKEN');
      }

      if (token.expiresAt.getTime() <= Date.now()) {
        return Errors.unauthorized('Session expired', 'REFRESH_TOKEN_EXPIRED');
      }

      const user = await userRepository.findById(token.userId, tx);
      if (!user) return Errors.unauthorized('Account no longer exists', 'INVALID_REFRESH_TOKEN');

      const { session, tokenId } = await issueSession(user, token.familyId, meta, tx);
      await refreshTokenRepository.markRotated(token.id, tokenId, tx);
      return session;
    });

    if (outcome instanceof AppError) throw outcome;
    return outcome;
  },

  async logout(rawToken: string | undefined): Promise<void> {
    const familyId = await refreshTokenRepository.findFamilyIdByRawToken(rawToken);
    if (familyId) await refreshTokenRepository.revokeFamily(familyId, 'logout');
  },

  async logoutAll(userId: string): Promise<number> {
    return refreshTokenRepository.revokeAllForUser(userId, 'logout_all');
  },
};
