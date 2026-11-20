import { pool, type Queryable } from '../../infrastructure/database/pool.js';
import { hashRefreshToken } from './token.service.js';

export type RevokeReason = 'rotated' | 'logout' | 'logout_all' | 'reuse_detected';

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
  revokedReason: RevokeReason | null;
}

export interface SessionSummary {
  familyId: string;
  userAgent: string | null;
  ipAddress: string | null;
  signedInAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
}

const COLUMNS = `
  id,
  user_id         AS "userId",
  family_id       AS "familyId",
  expires_at      AS "expiresAt",
  created_at      AS "createdAt",
  revoked_at      AS "revokedAt",
  revoked_reason  AS "revokedReason"
`;

export const refreshTokenRepository = {
  async insert(
    input: {
      userId: string;
      familyId: string;
      rawToken: string;
      expiresAt: Date;
      userAgent?: string | undefined;
      ipAddress?: string | undefined;
    },
    db: Queryable = pool,
  ): Promise<RefreshTokenRecord> {
    const { rows } = await db.query<RefreshTokenRecord>(
      `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${COLUMNS}`,
      [
        input.userId,
        input.familyId,
        hashRefreshToken(input.rawToken),
        input.expiresAt,
        input.userAgent?.slice(0, 300) ?? null,
        input.ipAddress ?? null,
      ],
    );
    return rows[0]!;
  },

  /**
   * Looks a token up by hash and locks the row (FOR UPDATE) so two concurrent
   * refreshes of the same token cannot both succeed.
   */
  async findByRawTokenForUpdate(rawToken: string, db: Queryable): Promise<RefreshTokenRecord | null> {
    const { rows } = await db.query<RefreshTokenRecord>(
      `SELECT ${COLUMNS} FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
      [hashRefreshToken(rawToken)],
    );
    return rows[0] ?? null;
  },

  async findFamilyIdByRawToken(rawToken: string | undefined, db: Queryable = pool): Promise<string | null> {
    if (!rawToken) return null;
    const { rows } = await db.query<{ familyId: string }>(
      `SELECT family_id AS "familyId" FROM refresh_tokens WHERE token_hash = $1`,
      [hashRefreshToken(rawToken)],
    );
    return rows[0]?.familyId ?? null;
  },

  async markRotated(id: string, replacedBy: string, db: Queryable): Promise<void> {
    await db.query(
      `UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = 'rotated', replaced_by = $2 WHERE id = $1`,
      [id, replacedBy],
    );
  },

  async revokeFamily(familyId: string, reason: RevokeReason, db: Queryable = pool): Promise<void> {
    await db.query(
      `UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = $2
       WHERE family_id = $1 AND revoked_at IS NULL`,
      [familyId, reason],
    );
  },

  async revokeAllForUser(userId: string, reason: RevokeReason, db: Queryable = pool): Promise<number> {
    const result = await db.query(
      `UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = $2
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId, reason],
    );
    return result.rowCount ?? 0;
  },

  /**
   * One row per active sign-in. The currently valid token of each family is the
   * one that is neither revoked nor expired; the family's first token tells us
   * when that sign-in started.
   */
  async listActiveSessions(userId: string, db: Queryable = pool): Promise<SessionSummary[]> {
    const { rows } = await db.query<SessionSummary>(
      `SELECT t.family_id   AS "familyId",
              t.user_agent  AS "userAgent",
              t.ip_address  AS "ipAddress",
              (SELECT min(f.created_at) FROM refresh_tokens f WHERE f.family_id = t.family_id) AS "signedInAt",
              t.created_at  AS "lastActiveAt",
              t.expires_at  AS "expiresAt"
        FROM refresh_tokens t
        WHERE t.user_id = $1 AND t.revoked_at IS NULL AND t.expires_at > now()
        ORDER BY t.created_at DESC`,
      [userId],
    );
    return rows;
  },
};
