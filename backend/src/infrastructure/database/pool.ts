import pg from 'pg';
import { config } from '../../config/env.js';
import { logger } from '../logging/logger.js';

// Return DATE columns as 'YYYY-MM-DD' strings. The default converts them to a JS
// Date at local midnight, which shifts the day for users in other time zones.
const PG_DATE_OID = 1082;
pg.types.setTypeParser(PG_DATE_OID, (value) => value);

/**
 * A single connection pool shared by the whole process. Each API instance keeps
 * at most DATABASE_POOL_MAX connections open to PostgreSQL; requests borrow a
 * connection, run their query, and give it back.
 */
export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: config.DATABASE_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (error) => {
  // An idle client lost its connection (e.g. PostgreSQL restarted). The pool
  // discards it and opens a new one on the next request.
  logger.error({ err: error }, 'Unexpected PostgreSQL pool error');
});

/** Anything that can run a query: the pool itself or a client inside a transaction. */
export type Queryable = Pick<pg.Pool, 'query'> | pg.PoolClient;

/** Runs `work` inside a transaction, committing on success and rolling back on any error. */
export async function withTransaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabase(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const started = performance.now();
  try {
    await pool.query('SELECT 1');
    return { ok: true, latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
