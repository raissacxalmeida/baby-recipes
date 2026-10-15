import { test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnv } from '../src/server/server.js';
import { createReset } from '../src/server/users.js';
import { PASSWORD, startTestServer } from './helpers/http.js';

let t;
beforeAll(async () => { t = await startTestServer(); });
afterAll(() => t.close());
beforeEach(() => t.db.reset());

const rawRequest = (options) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: t.port, ...options }, (res) => { res.resume(); resolve(res.statusCode); });
  req.on('error', reject);
  req.end();
});

test('serves index.html at / and for extension-less app paths', async () => {
  for (const path of ['/', '/admin', '/invite/abc']) {
    const res = await fetch(`${t.base}${path}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    expect(await res.text()).toBe('<h1>hello</h1>');
  }
});

test('missing files and traversal attempts give 404', async () => {
  expect((await fetch(`${t.base}/nope.js`)).status).toBe(404);
  expect((await fetch(`${t.base}/..%2fsecret.txt`)).status).toBe(404);
  expect(await rawRequest({ path: '/../secret.txt' })).toBe(404);
});

test('a foreign Host header is refused', async () => {
  expect(await rawRequest({ path: '/', headers: { Host: 'evil.example' } })).toBe(403);
});

test('POST without X-Requested-With is refused', async () => {
  const res = await fetch(`${t.base}/api/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
  expect(res.status).toBe(400);
});

test('login sets an HttpOnly SameSite=Lax cookie without Secure by default', async () => {
  await t.addUser('me@example.com', { admin: true });
  const res = await t.call('POST', '/api/login', { email: 'me@example.com', password: PASSWORD });
  expect(res.status).toBe(200);
  expect(res.body.user).toEqual({ email: 'me@example.com', isAdmin: true });
  expect(res.setCookie).toMatch(/^session=[A-Za-z0-9_-]{43};/);
  expect(res.setCookie).toMatch(/HttpOnly/);
  expect(res.setCookie).toMatch(/SameSite=Lax/);
  expect(res.setCookie).not.toMatch(/Secure/);
});

test('the Secure flag follows the COOKIE_SECURE setting', async () => {
  const secure = await startTestServer({ config: { cookieSecure: true } });
  try {
    await secure.addUser('me@example.com', { admin: true });
    const res = await secure.call('POST', '/api/login', { email: 'me@example.com', password: PASSWORD });
    expect(res.setCookie).toMatch(/Secure/);
  } finally {
    await secure.close();
  }
});

test('session, logout and 401 without a cookie', async () => {
  await t.addUser('ana@example.com');
  expect((await t.call('GET', '/api/session')).status).toBe(401);
  const jar = await t.loginAs('ana@example.com');
  const session = await t.call('GET', '/api/session', undefined, jar);
  expect(session.body.user).toEqual({ email: 'ana@example.com', isAdmin: false });
  const cookie = jar.cookie;
  await t.call('POST', '/api/logout', {}, jar);
  expect((await t.call('GET', '/api/session', undefined, { cookie })).status).toBe(401);
});

test('a wrong password and an unknown email look the same; the 11th failure is locked', async () => {
  await t.addUser('ana@example.com');
  const wrong = await t.call('POST', '/api/login', { email: 'ana@example.com', password: 'wrong password!!' });
  const unknown = await t.call('POST', '/api/login', { email: 'nobody@example.com', password: 'wrong password!!' });
  expect(wrong.status).toBe(401);
  expect(unknown.status).toBe(401);
  expect(unknown.body).toEqual(wrong.body);
  for (let i = 0; i < 9; i++) await t.call('POST', '/api/login', { email: 'ana@example.com', password: 'wrong password!!' });
  const locked = await t.call('POST', '/api/login', { email: 'ana@example.com', password: PASSWORD });
  expect(locked.status).toBe(429);
});

test('invite flow: check the link, sign up, land logged in', async () => {
  const { createInvite } = await import('../src/server/users.js');
  const { token } = await createInvite(t.db, 'joao@example.com', t.now);
  expect((await t.call('GET', '/api/invite/garbage')).status).toBe(404);
  expect((await t.call('GET', `/api/invite/${token}`)).body).toEqual({ email: 'joao@example.com' });
  const short = await t.call('POST', '/api/signup', { token, password: 'short' });
  expect(short.status).toBe(400);
  const jar = t.newJar();
  const res = await t.call('POST', '/api/signup', { token, password: PASSWORD }, jar);
  expect(res.status).toBe(200);
  expect((await t.call('GET', '/api/session', undefined, jar)).body.user.email).toBe('joao@example.com');
  expect((await t.call('POST', '/api/signup', { token, password: PASSWORD })).status).toBe(404);
});

test('reset flow changes the password', async () => {
  const ana = await t.addUser('ana@example.com');
  const { token } = await createReset(t.db, ana.id, t.now);
  expect((await t.call('GET', `/api/reset/${token}`)).body).toEqual({ email: 'ana@example.com' });
  const res = await t.call('POST', '/api/reset', { token, password: 'another long password' });
  expect(res.status).toBe(200);
  expect((await t.call('POST', '/api/login', { email: 'ana@example.com', password: PASSWORD })).status).toBe(401);
  expect((await t.call('POST', '/api/login', { email: 'ana@example.com', password: 'another long password' })).status).toBe(200);
});

test('PUT and DELETE also need X-Requested-With', async () => {
  const put = await fetch(`${t.base}/api/birthdate`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{}' });
  expect(put.status).toBe(400);
  expect((await fetch(`${t.base}/api/account`, { method: 'DELETE' })).status).toBe(400);
});

test('every response carries basic security headers', async () => {
  for (const path of ['/', '/api/session']) {
    const res = await fetch(`${t.base}${path}`);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  }
});

test('logout clears the cookie with Max-Age=0', async () => {
  await t.addUser('ana@example.com');
  const jar = await t.loginAs('ana@example.com');
  const res = await t.call('POST', '/api/logout', {}, jar);
  expect(res.setCookie).toMatch(/Max-Age=0/);
  expect(res.setCookie).toMatch(/HttpOnly/);
});

test('a custom ALLOWED_HOSTS list decides which Host headers are served', async () => {
  const custom = await startTestServer({ config: { allowedHosts: ['my-mac.local'] } });
  try {
    const status = (host) => new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: custom.port, path: '/', headers: { Host: host } }, (res) => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject);
      req.end();
    });
    expect(await status('my-mac.local:3000')).toBe(200);
    expect(await status('MY-MAC.LOCAL:3000')).toBe(200);
    expect(await status('127.0.0.1:3000')).toBe(403);
  } finally {
    await custom.close();
  }
});

test('signing up works even when the invited email has a stale lockout record', async () => {
  const { createInvite } = await import('../src/server/users.js');
  await t.db.query("insert into login_attempts (email, failures, first_failure_at, locked_until) values ('joao@example.com', 10, $1, $2)", [t.now, new Date(t.now.getTime() + 600000)]);
  const { token } = await createInvite(t.db, 'joao@example.com', t.now);
  const res = await t.call('POST', '/api/signup', { token, password: PASSWORD });
  expect(res.status).toBe(200);
  expect((await t.db.query("select * from login_attempts where email = 'joao@example.com'")).rows).toHaveLength(0);
});

test('bad bodies and unknown routes', async () => {
  const bad = await fetch(`${t.base}/api/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'X-Requested-With': 'fetch' }, body: '{not json',
  });
  expect(bad.status).toBe(400);
  const big = await t.call('POST', '/api/login', { pad: 'x'.repeat(200000) });
  expect(big.status).toBe(400);
  expect((await t.call('GET', '/api/nothing-here')).status).toBe(404);
});

test('responses never contain hashes', async () => {
  await t.addUser('ana@example.com');
  const jar = await t.loginAs('ana@example.com');
  const res = await t.call('GET', '/api/session', undefined, jar);
  expect(JSON.stringify(res.body)).not.toMatch(/hash|password/i);
});

test('loadEnv reads a file, strips quotes and does not override existing variables', () => {
  const dir = mkdtempSync(join(tmpdir(), 'env-'));
  const file = join(dir, '.env');
  writeFileSync(file, 'BABY_TEST_A=from-file\nBABY_TEST_B=from-file\nBABY_TEST_Q="sk-abc"\n# comment\n');
  process.env.BABY_TEST_B = 'already';
  delete process.env.BABY_TEST_A;
  delete process.env.BABY_TEST_Q;
  loadEnv(file);
  expect(process.env.BABY_TEST_A).toBe('from-file');
  expect(process.env.BABY_TEST_B).toBe('already');
  expect(process.env.BABY_TEST_Q).toBe('sk-abc');
  expect(() => loadEnv(join(dir, 'missing'))).not.toThrow();
});
