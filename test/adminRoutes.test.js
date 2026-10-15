import { test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestServer } from './helpers/http.js';

let t;
let admin;
let ana;
let anaUser;

beforeAll(async () => { t = await startTestServer({ config: { publicUrl: 'http://my-mac.local:3000' } }); });
afterAll(() => t.close());

const guest = () => t.newJar();

beforeEach(async () => {
  await t.db.reset();
  admin = await t.loginAsNew('me@example.com', true);
  await t.addUser('ana@example.com');
  ana = await t.loginAs('ana@example.com');
  anaUser = (await t.db.query("select id from users where email = 'ana@example.com'")).rows[0];
});

const tokenOf = (link) => link.split('/').pop();

test('non-admins get 403 and anonymous visitors 401 on every admin route, and nothing changes', async () => {
  const calls = [
    ['GET', '/api/admin/overview'], ['POST', '/api/admin/invites', { email: 'x@example.com' }],
    ['DELETE', '/api/admin/invites/00000000-0000-0000-0000-000000000000'],
    ['POST', `/api/admin/people/${anaUser.id}/reset`, {}], ['DELETE', `/api/admin/people/${anaUser.id}`],
  ];
  for (const [method, path, body] of calls) {
    const forbidden = await t.call(method, path, body, ana);
    expect(forbidden.status, `${method} ${path} as user`).toBe(403);
    expect(forbidden.body).toEqual({ error: 'forbidden', message: 'Not allowed' });
    expect((await t.call(method, path, body, guest())).status, `${method} ${path} anonymous`).toBe(401);
  }
  expect((await t.db.query('select * from invites')).rows).toHaveLength(2);
  expect((await t.db.query('select * from users')).rows).toHaveLength(2);
  expect((await t.call('GET', '/api/session', undefined, ana)).status).toBe(200);
});

test('creating an invite returns a link on PUBLIC_URL that works', async () => {
  const res = await t.call('POST', '/api/admin/invites', { email: 'Joao@example.com' }, admin);
  expect(res.status).toBe(200);
  expect(res.body.link).toMatch(/^http:\/\/my-mac\.local:3000\/invite\/[A-Za-z0-9_-]{43}$/);
  const check = await t.call('GET', `/api/invite/${tokenOf(res.body.link)}`);
  expect(check.body).toEqual({ email: 'joao@example.com' });
});

test('inviting an existing email or a pending one is 409', async () => {
  expect((await t.call('POST', '/api/admin/invites', { email: 'ana@example.com' }, admin)).status).toBe(409);
  await t.call('POST', '/api/admin/invites', { email: 'joao@example.com' }, admin);
  expect((await t.call('POST', '/api/admin/invites', { email: 'joao@example.com' }, admin)).status).toBe(409);
});

test('overview lists invites and people and revoke removes an invite', async () => {
  await t.call('POST', '/api/admin/invites', { email: 'joao@example.com' }, admin);
  let overview = (await t.call('GET', '/api/admin/overview', undefined, admin)).body;
  const pending = overview.invites.find((i) => i.email === 'joao@example.com');
  expect(pending).toMatchObject({ status: 'pending', daysLeft: 7 });
  expect(overview.limit).toBe(10);
  expect(overview.people.map((p) => p.email).sort()).toEqual(['ana@example.com', 'me@example.com']);
  expect(JSON.stringify(overview)).not.toMatch(/token_hash|password|hash/i);
  expect((await t.call('DELETE', `/api/admin/invites/${pending.id}`, undefined, admin)).status).toBe(200);
  overview = (await t.call('GET', '/api/admin/overview', undefined, admin)).body;
  expect(overview.invites.find((i) => i.email === 'joao@example.com')).toBeUndefined();
});

test('a reset link works once for that person', async () => {
  const res = await t.call('POST', `/api/admin/people/${anaUser.id}/reset`, {}, admin);
  expect(res.body.link).toMatch(/^http:\/\/my-mac\.local:3000\/reset\//);
  const done = await t.call('POST', '/api/reset', { token: tokenOf(res.body.link), password: 'another long password' });
  expect(done.status).toBe(200);
  expect((await t.call('GET', '/api/session', undefined, { cookie: ana.cookie })).status).toBe(401);
});

test('removing a person ends their session; removing the admin is 403', async () => {
  const adminRow = (await t.db.query("select id from users where email = 'me@example.com'")).rows[0];
  expect((await t.call('DELETE', `/api/admin/people/${adminRow.id}`, undefined, admin)).status).toBe(403);
  expect((await t.call('DELETE', `/api/admin/people/${anaUser.id}`, undefined, admin)).status).toBe(200);
  expect((await t.call('GET', '/api/session', undefined, { cookie: ana.cookie })).status).toBe(401);
  expect((await t.call('DELETE', `/api/admin/people/${anaUser.id}`, undefined, admin)).status).toBe(404);
});
