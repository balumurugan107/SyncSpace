import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type pg from 'pg';

/**
 * Minimal, transparent SQL migration runner.
 *
 * - Migrations are plain `.sql` files named `NNN_description.sql`, applied in order.
 * - Each file runs inside its own transaction: it either fully applies or not at all.
 * - Applied files are recorded in `schema_migrations` with a checksum, so editing an
 *   already-applied migration is detected and rejected.
 * - A PostgreSQL advisory lock ensures that if several API instances start at once,
 *   only one of them migrates; the others wait and then see nothing left to do.
 */
const MIGRATION_LOCK_ID = 727_001;
const FILE_PATTERN = /^\d{3,}_[\w-]+\.sql$/;

export interface MigrationLogger {
  info(message: string): void;
}

export async function runMigrations(
  client: pg.ClientBase,
  migrationsDir: string,
  log: MigrationLogger = { info: () => undefined },
): Promise<string[]> {
  const files = (await readdir(migrationsDir)).filter((file) => FILE_PATTERN.test(file)).sort();

  await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name        TEXT PRIMARY KEY,
        checksum    TEXT NOT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query<{ name: string; checksum: string }>(
      'SELECT name, checksum FROM schema_migrations',
    );
    const applied = new Map(rows.map((row) => [row.name, row.checksum]));
    const newlyApplied: string[] = [];

    for (const file of files) {
      const sql = await readFile(path.join(migrationsDir, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previous = applied.get(file);

      if (previous) {
        if (previous !== checksum) {
          throw new Error(
            `Migration ${file} was modified after being applied. Create a new migration instead of editing it.`,
          );
        }
        continue;
      }

      log.info(`Applying migration ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [file, checksum]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      newlyApplied.push(file);
    }

    return newlyApplied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
  }
}
