import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestDb } from './db.js';
import { createServer } from '../../src/server/server.js';
import { acceptInvite, createAdmin, createInvite } from '../../src/server/users.js';

export const PASSWORD = 'a long enough password';

export async function startTestServer(overrides = {}) {
  const db = await createTestDb();
  const staticDir = mkdtempSync(join(tmpdir(), 'static-'));
  writeFileSync(join(staticDir, 'index.html'), '<h1>hello</h1>');
  writeFileSync(join(staticDir, '..', 'secret.txt'), 'secret');
  const config = {
    databaseUrl: '', openaiKey: '', publicUrl: 'http://localhost:3000',
    allowedHosts: ['localhost', '127.0.0.1'], cookieSecure: false, port: 0, ...overrides.config,
  };
  let clock = new Date('2026-10-15T12:00:00Z');
  let model = async () => { throw new Error('no model set'); };
  const server = createServer({
    db, config, staticDir, now: () => clock, callModel: (input) => model(input),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const newJar = () => ({ cookie: '' });
  async function call(method, path, body, jar = newJar(), headers = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'X-Requested-With': 'fetch',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(jar.cookie ? { Cookie: jar.cookie } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) jar.cookie = setCookie.startsWith('session=;') || /Max-Age=0/.test(setCookie) ? '' : setCookie.split(';')[0];
    const text = await res.text();
    let parsed = text;
    try { parsed = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, body: parsed, headers: res.headers, setCookie, jar };
  }

  async function addUser(email, { admin = false } = {}) {
    const { token } = admin ? await createAdmin(db, email, clock) : await createInvite(db, email, clock);
    return acceptInvite(db, { token, password: PASSWORD }, clock);
  }
  async function loginAs(email) {
    const jar = newJar();
    const res = await call('POST', '/api/login', { email, password: PASSWORD }, jar);
    if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`);
    return jar;
  }

  return {
    base, db, config, staticDir, port, newJar, call, addUser, loginAs,
    loginAsNew: async (email, admin = false) => { await addUser(email, { admin }); return loginAs(email); },
    get now() { return clock; },
    setNow: (d) => { clock = d; },
    setModel: (fn) => { model = fn; },
    close: async () => { await new Promise((r) => server.close(r)); await db.close(); },
  };
}
