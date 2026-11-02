import pg from 'pg';
import type { Db, Queryable } from './types.js';

// pg types its rows as any[], so the row type each caller names through query<Row> is taken on trust.
const queryWith = (client: pg.Pool | pg.PoolClient): Queryable['query'] =>
  async <R>(text: string, params?: unknown[]) => (await client.query(text, params)) as unknown as { rows: R[] };

export function createPgDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString });
  // A database restart must not crash the app; the next query reconnects.
  pool.on('error', (err) => console.error('Database connection error:', err.message));
  return {
    query: queryWith(pool),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({ query: queryWith(client) });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
