import pg from 'pg';
import { config } from '../../config/env.js';
import { logger } from '../logging/logger.js';
import { runMigrations } from './migrator.js';

/**
 * Entry point for the one-shot `migrate` container (and `npm run migrate`).
 * Docker Compose starts the API only after this exits successfully.
 */
async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: config.DATABASE_URL });
  await client.connect();
  try {
    const applied = await runMigrations(client, config.MIGRATIONS_DIR, {
      info: (message) => logger.info(message),
    });
    logger.info(
      { applied },
      applied.length ? `Applied ${applied.length} migration(s)` : 'Database schema is up to date',
    );
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Migration failed');
  process.exitCode = 1;
});
