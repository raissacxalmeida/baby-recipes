import { test, expect } from 'vitest';
import { createTestDb } from './helpers/db.js';
import { startMain } from '../src/server/main.js';

const env = { DATABASE_URL: 'postgres://x', PUBLIC_URL: 'http://my-mac.local:3000', PORT: '0' };

async function stop(started) {
  await new Promise((resolve) => started.server.close(resolve));
  await started.db.close();
}

test('startMain migrates, listens and answers the API', async () => {
  const started = await startMain(env, { createDb: () => createTestDb() });
  try {
    const { port } = started.server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/session`);
    expect(res.status).toBe(401);
    const tables = await started.db.query("select to_regclass('public.users') as t");
    expect(tables.rows[0].t).toBe('users');
  } finally {
    await stop(started);
  }
});

test('a missing PUBLIC_URL rejects with a message naming it', async () => {
  await expect(startMain({ DATABASE_URL: 'postgres://x' }, { createDb: () => createTestDb() })).rejects.toThrow(/PUBLIC_URL/);
});

test('it waits for a database that is not ready yet', async () => {
  let failures = 2;
  const createDb = async () => {
    const db = await createTestDb();
    const query = db.query;
    return { ...db, query: (text, params) => {
      if (failures > 0) { failures -= 1; return Promise.reject(new Error('connection refused')); }
      return query(text, params);
    } };
  };
  const started = await startMain(env, { createDb, retryDelayMs: 5 });
  try {
    expect(failures).toBe(0);
  } finally {
    await stop(started);
  }
});

test('it gives up with a clear message when the database never answers', async () => {
  const createDb = () => ({ query: () => Promise.reject(new Error('connection refused')), close: async () => {} });
  await expect(startMain(env, { createDb, retries: 3, retryDelayMs: 1 })).rejects.toThrow(/database/i);
});
