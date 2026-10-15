import pg from 'pg';

export function createPgDb(connectionString) {
  const pool = new pg.Pool({ connectionString });
  // A database restart must not crash the app; the next query reconnects.
  pool.on('error', (err) => console.error('Database connection error:', err.message));
  return {
    query: (text, params) => pool.query(text, params),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({ query: (text, params) => client.query(text, params) });
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
