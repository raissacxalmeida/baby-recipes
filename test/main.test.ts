import { test, expect } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createTestDb } from './helpers/db.js';
import { startMain } from '../src/server/main.js';
import type { Db, Row } from '../src/server/types.js';

const env = { DATABASE_URL: 'postgres://x', PUBLIC_URL: 'http://my-mac.local:3000', PORT: '0' };

async function stop(started: Awaited<ReturnType<typeof startMain>>) {
  await new Promise((resolve) => started.server.close(resolve));
  await started.db.close();
}

test('startMain migrates, listens and answers the API', async () => {
  const started = await startMain(env, { createDb: () => createTestDb() });
  try {
    // Listening on a TCP port, so the address is an AddressInfo (not a pipe's string or null).
    const { port } = started.server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/session`);
    expect(res.status).toBe(401);
    const tables = await started.db.query("select to_regclass('public.users') as t");
    expect(tables.rows[0].t).toBe('users');
  } finally {
    await stop(started);
  }
});

test('startMain seeds the recipe catalogue', async () => {
  const started = await startMain(env, { createDb: () => createTestDb() });
  try {
    const { rows } = await started.db.query('select count(*)::int as n from catalogue_recipes');
    expect(rows[0].n).toBe(49);
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
    return { ...db, query: <R = Row>(text: string, params?: unknown[]) => {
      if (failures > 0) { failures -= 1; return Promise.reject(new Error('connection refused')); }
      return query<R>(text, params);
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
  // A database that never answers has no transaction: startMain gives up before it would open one.
  const createDb = () => ({ query: () => Promise.reject(new Error('connection refused')), close: async () => {} }) as Partial<Db> as Db;
  await expect(startMain(env, { createDb, retries: 3, retryDelayMs: 1 })).rejects.toThrow(/database/i);
});
