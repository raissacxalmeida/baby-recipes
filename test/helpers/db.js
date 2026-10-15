import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../../src/server/migrate.js';
import { APP_TABLES } from '../../src/server/migrations.js';

// In-process Postgres for tests; same SQL as production.
export async function createTestDb() {
  const lite = new PGlite();
  const db = {
    query: (text, params) => lite.query(text, params),
    transaction: (fn) => lite.transaction((tx) => fn({ query: (text, params) => tx.query(text, params) })),
    close: () => lite.close(),
    reset: () => lite.query(`truncate ${APP_TABLES.join(', ')} restart identity cascade`),
  };
  await migrate(db);
  return db;
}
