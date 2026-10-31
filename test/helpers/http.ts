import { mkdtempSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestDb } from './db.js';
import { createServer } from '../../src/server/server.js';
import { acceptInvite, createAdmin, createInvite } from '../../src/server/users.js';
import type { Config, ModelCall, TranslateCall } from '../../src/server/types.js';

export const PASSWORD = 'a long enough password';

// The session cookie a test carries between calls, like a browser would.
export interface Jar {
  cookie: string;
}

export interface CallResult {
  status: number;
  // The server's answer parsed as JSON (or the raw text when it is not JSON). It is wire data with no static type:
  // tests read into it freely and every claim about its shape is an assertion, so it stays as JSON.parse gives it.
  body: any;
  headers: Headers;
  setCookie: string | null;
  jar: Jar;
}

export interface TestServerOptions {
  config?: Partial<Config>;
}

export async function startTestServer(overrides: TestServerOptions = {}) {
  const db = await createTestDb();
  const staticDir = mkdtempSync(join(tmpdir(), 'static-'));
  writeFileSync(join(staticDir, 'index.html'), '<h1>hello</h1>');
  writeFileSync(join(staticDir, '..', 'secret.txt'), 'secret');
  const config: Config = {
    databaseUrl: '', openaiKey: '', publicUrl: 'http://localhost:3000',
    allowedHosts: ['localhost', '127.0.0.1'], cookieSecure: false, port: 0, ...overrides.config,
  };
  let clock = new Date('2026-10-15T12:00:00Z');
  let model: ModelCall = async () => { throw new Error('no model set'); };
  let translator: TranslateCall = async () => { throw new Error('no translator set'); };
  const server = createServer({
    db, config, staticDir, now: () => clock, callModel: (input) => model(input), callTranslate: (task) => translator(task),
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  // Listening on a TCP port, so the address is an AddressInfo (not the string of a pipe or null).
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;

  const newJar = (): Jar => ({ cookie: '' });
  async function call(method: string, path: string, body?: unknown, jar: Jar = newJar(), headers: Record<string, string> = {}): Promise<CallResult> {
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
    let parsed: CallResult['body'] = text;
    try { parsed = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, body: parsed, headers: res.headers, setCookie, jar };
  }

  async function addUser(email: string, { admin = false }: { admin?: boolean } = {}) {
    const { token } = admin ? await createAdmin(db, email, clock) : await createInvite(db, email, clock);
    return acceptInvite(db, { token, password: PASSWORD }, clock);
  }
  async function loginAs(email: string): Promise<Jar> {
    const jar = newJar();
    const res = await call('POST', '/api/login', { email, password: PASSWORD }, jar);
    if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`);
    return jar;
  }

  return {
    base, db, config, staticDir, port, newJar, call, addUser, loginAs,
    loginAsNew: async (email: string, admin = false) => { await addUser(email, { admin }); return loginAs(email); },
    get now() { return clock; },
    setNow: (d: Date) => { clock = d; },
    setModel: (fn: ModelCall) => { model = fn; },
    setTranslator: (fn: TranslateCall) => { translator = fn; },
    close: async () => { await new Promise((r) => server.close(r)); await db.close(); },
  };
}

export type TestServer = Awaited<ReturnType<typeof startTestServer>>;
