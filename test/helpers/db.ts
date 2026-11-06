import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../../src/server/migrate.js';
import { APP_TABLES } from '../../src/server/migrations.js';
import type { Db, Queryable, Row } from '../../src/server/types.js';

export type TestDb = Db & { reset(): Promise<unknown> };

// In-process Postgres for tests; same SQL as production.
export async function createTestDb({ upTo }: { upTo?: number } = {}): Promise<TestDb> {
  const lite = new PGlite();
  const db: TestDb = {
    query: <R = Row>(text: string, params?: unknown[]) => lite.query<R>(text, params),
    transaction: <T>(fn: (tx: Queryable) => Promise<T>) =>
      lite.transaction((tx) => fn({ query: <R = Row>(text: string, params?: unknown[]) => tx.query<R>(text, params) })),
    close: () => lite.close(),
    reset: () => lite.query(`truncate ${APP_TABLES.join(', ')} restart identity cascade`),
  };
  await migrate(db, upTo);
  return db;
}
