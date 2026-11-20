import { pool, type Queryable } from '../../infrastructure/database/pool.js';

/** Row as stored in PostgreSQL (includes the password hash; never send this to clients). */
export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

/** Safe, client-facing representation of a user. */
export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  lastLoginAt: string | null;
}

const COLUMNS = `
  id,
  email,
  password_hash   AS "passwordHash",
  display_name    AS "displayName",
  created_at      AS "createdAt",
  updated_at      AS "updatedAt",
  last_login_at   AS "lastLoginAt"
`;

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  };
}

export const userRepository = {
  async findById(id: string, db: Queryable = pool): Promise<UserRecord | null> {
    const { rows } = await db.query<UserRecord>(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  async findByEmail(email: string, db: Queryable = pool): Promise<UserRecord | null> {
    const { rows } = await db.query<UserRecord>(`SELECT ${COLUMNS} FROM users WHERE email = $1`, [
      email.toLowerCase(),
    ]);
    return rows[0] ?? null;
  },

  async create(
    input: { email: string; passwordHash: string; displayName: string },
    db: Queryable = pool,
  ): Promise<UserRecord> {
    const { rows } = await db.query<UserRecord>(
      `INSERT INTO users (email, password_hash, display_name, last_login_at)
       VALUES ($1, $2, $3, now())
       RETURNING ${COLUMNS}`,
      [input.email.toLowerCase(), input.passwordHash, input.displayName],
    );
    return rows[0]!;
  },

  async updateProfile(id: string, input: { displayName: string }, db: Queryable = pool): Promise<UserRecord | null> {
    const { rows } = await db.query<UserRecord>(
      `UPDATE users SET display_name = $2, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, input.displayName],
    );
    return rows[0] ?? null;
  },

  async touchLastLogin(id: string, db: Queryable = pool): Promise<UserRecord | null> {
    const { rows } = await db.query<UserRecord>(
      `UPDATE users SET last_login_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
      [id],
    );
    return rows[0] ?? null;
  },
};
