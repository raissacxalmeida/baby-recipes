import { test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PASSWORD, startTestServer } from './helpers/http.js';
import { createInvite } from '../src/server/users.js';

let t;
let ana;

beforeAll(async () => { t = await startTestServer(); });
afterAll(() => t.close());
beforeEach(async () => {
  await t.db.reset();
  ana = await t.loginAsNew('ana@example.com');
});

const language = async (jar) => (await t.call('GET', '/api/session', undefined, jar)).body.user.language;

test('a new account has no saved language', async () => {
  const res = await t.call('GET', '/api/session', undefined, ana);
  expect(res.body).toEqual({ user: { email: 'ana@example.com', isAdmin: false, language: null } });
});

test('saving a language shows on the session and on the next login', async () => {
  const saved = await t.call('PUT', '/api/language', { language: 'de' }, ana);
  expect(saved.status).toBe(200);
  expect(saved.body).toEqual({ ok: true });
  expect(await language(ana)).toBe('de');
  const again = await t.call('POST', '/api/login', { email: 'ana@example.com', password: PASSWORD });
  expect(again.body.user.language).toBe('de');
});

test('an unsupported language is refused and the saved one stays', async () => {
  await t.call('PUT', '/api/language', { language: 'es' }, ana);
  const res = await t.call('PUT', '/api/language', { language: 'fr' }, ana);
  expect(res.status).toBe(400);
  expect(res.body.error).toBe('invalid-input');
  expect(await language(ana)).toBe('es');
});

test('a missing language is refused', async () => {
  expect((await t.call('PUT', '/api/language', {}, ana)).status).toBe(400);
});

test('saving a language needs a login', async () => {
  expect((await t.call('PUT', '/api/language', { language: 'pt' })).status).toBe(401);
});

test('the signup reply has no language yet', async () => {
  const { token } = await createInvite(t.db, 'bia@example.com', t.now);
  const res = await t.call('POST', '/api/signup', { token, password: PASSWORD });
  expect(res.status).toBe(200);
  expect(res.body.user.language).toBeNull();
});
