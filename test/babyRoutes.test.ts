import { test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestServer, type Jar, type TestServer } from './helpers/http.js';

let t: TestServer;
let ana: Jar;
let admin: Jar;

beforeAll(async () => { t = await startTestServer(); });
afterAll(() => t.close());

beforeEach(async () => {
  await t.db.reset();
  admin = await t.loginAsNew('me@example.com', true);
  ana = await t.loginAsNew('ana@example.com');
});

test('every baby route is 401 without a cookie', async () => {
  const calls: [method: string, path: string, body?: unknown][] = [
    ['GET', '/api/babies'], ['POST', '/api/babies', { name: 'Mia', birthdate: '2026-02-14' }],
    ['PUT', '/api/babies/6f1c1d3e-0b1a-4c55-9a53-1f2b3c4d5e6f', { name: 'Mia', birthdate: '2026-02-14' }],
    ['DELETE', '/api/babies/6f1c1d3e-0b1a-4c55-9a53-1f2b3c4d5e6f'],
    ['PUT', '/api/last-baby', { id: '6f1c1d3e-0b1a-4c55-9a53-1f2b3c4d5e6f' }],
  ];
  for (const [method, path, body] of calls) expect((await t.call(method, path, body)).status, `${method} ${path}`).toBe(401);
});

test('babies start empty, then list what was added, edited and last used', async () => {
  expect((await t.call('GET', '/api/babies', undefined, ana)).body).toEqual({ babies: [], lastBabyId: null });

  const added = await t.call('POST', '/api/babies', { name: ' Mia ', birthdate: '2026-02-14' }, ana);
  expect(added.status).toBe(200);
  const baby = { id: expect.any(String), name: 'Mia', birthdate: '2026-02-14' };
  expect(added.body).toEqual({ baby });
  const id: string = added.body.baby.id;
  expect((await t.call('GET', '/api/babies', undefined, ana)).body).toEqual({ babies: [baby], lastBabyId: null });

  const edited = await t.call('PUT', `/api/babies/${id}`, { name: 'Lia', birthdate: '2026-01-02' }, ana);
  expect(edited).toMatchObject({ status: 200, body: { ok: true } });
  expect((await t.call('GET', '/api/babies', undefined, ana)).body.babies).toEqual([{ id, name: 'Lia', birthdate: '2026-01-02' }]);

  expect(await t.call('PUT', '/api/last-baby', { id }, ana)).toMatchObject({ status: 200, body: { ok: true } });
  expect((await t.call('GET', '/api/babies', undefined, ana)).body.lastBabyId).toBe(id);
});

test('errors carry their keys and another account cannot touch a baby', async () => {
  const bad = await t.call('POST', '/api/babies', { name: '', birthdate: '2026-02-14' }, ana);
  expect(bad.status).toBe(400);
  expect(bad.body).toMatchObject({ key: 'err.babyName', params: { max: 30 } });

  const id: string = (await t.call('POST', '/api/babies', { name: 'Mia', birthdate: '2026-02-14' }, ana)).body.baby.id;
  const bia = await t.loginAsNew('bia@example.com');
  expect((await t.call('PUT', `/api/babies/${id}`, { name: 'X', birthdate: '2026-02-14' }, bia)).status).toBe(404);
  expect((await t.call('PUT', '/api/last-baby', { id }, bia)).status).toBe(404);
  expect((await t.call('PUT', '/api/last-baby', {}, bia)).status).toBe(400);
});

test('the admin can add babies too', async () => {
  const added = await t.call('POST', '/api/babies', { name: 'Zoe', birthdate: '2026-02-14' }, admin);
  expect(added.status).toBe(200);
  expect((await t.call('GET', '/api/babies', undefined, admin)).body.babies).toHaveLength(1);
});

test('DELETE /api/babies/:id removes a baby, refuses the only baby, and another account gets 404', async () => {
  const mia = await t.addBaby(ana);
  const leo = await t.addBaby(ana, { name: 'Leo' });
  const bia = await t.loginAsNew('bia@example.com');
  expect((await t.call('DELETE', `/api/babies/${mia.id}`, undefined, bia)).status).toBe(404);
  expect(await t.call('DELETE', `/api/babies/${mia.id}`, undefined, ana)).toMatchObject({ status: 200, body: { ok: true } });
  expect((await t.call('GET', '/api/babies', undefined, ana)).body.babies.map((b: { id: string }) => b.id)).toEqual([leo.id]);
  const last = await t.call('DELETE', `/api/babies/${leo.id}`, undefined, ana);
  expect(last.status).toBe(409);
  expect(last.body).toMatchObject({ key: 'err.babyLast' });
});
