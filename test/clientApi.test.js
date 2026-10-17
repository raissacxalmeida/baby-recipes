import { test, expect, vi } from 'vitest';
import { createApi } from '../src/client/api.js';

const reply = (status, body) => vi.fn(async () => ({ ok: status < 400, status, json: async () => body }));

test('login posts JSON with the X-Requested-With header and same-origin cookies', async () => {
  const fetchImpl = reply(200, { user: { email: 'ana@example.com', isAdmin: false } });
  const user = await createApi(fetchImpl).login('ana@example.com', 'a long enough password');
  expect(user).toEqual({ email: 'ana@example.com', isAdmin: false });
  const [url, init] = fetchImpl.mock.calls[0];
  expect(url).toBe('/api/login');
  expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin' });
  expect(init.headers['X-Requested-With']).toBe('fetch');
  expect(init.headers['Content-Type']).toBe('application/json');
  expect(JSON.parse(init.body)).toEqual({ email: 'ana@example.com', password: 'a long enough password' });
});

test('GET requests carry no body or content type', async () => {
  const fetchImpl = reply(200, { birthdate: null, liked: [], disliked: [], usage: null });
  await createApi(fetchImpl).state();
  const [url, init] = fetchImpl.mock.calls[0];
  expect(url).toBe('/api/state');
  expect(init.body).toBeUndefined();
  expect(init.headers['Content-Type']).toBeUndefined();
});

test('session() is null on 401 and the user otherwise', async () => {
  expect(await createApi(reply(401, { error: 'unauthorized', message: 'Please log in' })).session()).toBeNull();
  expect(await createApi(reply(200, { user: { email: 'a@b.c', isAdmin: true } })).session()).toEqual({ user: { email: 'a@b.c', isAdmin: true } });
});

test('an error response throws the server message with status and code', async () => {
  const api = createApi(reply(429, { error: 'locked', message: 'Too many attempts. Try again in 15 minutes' }));
  await expect(api.login('a@b.c', 'x')).rejects.toMatchObject({
    message: 'Too many attempts. Try again in 15 minutes', status: 429, code: 'locked',
  });
});

test('a network failure has a readable message', async () => {
  const api = createApi(async () => { throw new TypeError('Failed to fetch'); });
  await expect(api.state()).rejects.toThrow('Could not reach the server');
});

test('suggest sends only the ingredients and returns the recipe', async () => {
  const fetchImpl = reply(200, { recipe: { title: 'Banana mash' } });
  expect((await createApi(fetchImpl).suggest(['banana'])).title).toBe('Banana mash');
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ ingredients: ['banana'] });
});

test('feedback and account calls use the documented paths', async () => {
  const fetchImpl = reply(200, { ok: true });
  const api = createApi(fetchImpl);
  const recipe = { id: 'banana-mash', title: 'Banana mash' };
  await api.setBirthdate('2026-03-14');
  await api.like(recipe);
  await api.unlike('banana-mash');
  await api.dislike(recipe);
  await api.restore('banana-mash');
  await api.deleteAccount();
  await api.logout();
  expect(fetchImpl.mock.calls.map(([url, init]) => `${init.method} ${url}`)).toEqual([
    'PUT /api/birthdate', 'POST /api/liked', 'DELETE /api/liked/banana-mash', 'POST /api/disliked',
    'POST /api/disliked/banana-mash/restore', 'DELETE /api/account', 'POST /api/logout',
  ]);
});

test('admin calls use the documented paths and encode ids', async () => {
  const fetchImpl = reply(200, { link: 'x', invites: [], people: [] });
  const { admin } = createApi(fetchImpl);
  await admin.overview();
  await admin.createInvite('joao@example.com');
  await admin.revokeInvite('i 1');
  await admin.reset('p1');
  await admin.remove('p1');
  expect(fetchImpl.mock.calls.map(([url, init]) => `${init.method} ${url}`)).toEqual([
    'GET /api/admin/overview', 'POST /api/admin/invites', 'DELETE /api/admin/invites/i%201',
    'POST /api/admin/people/p1/reset', 'DELETE /api/admin/people/p1',
  ]);
});

test('invite, signup and reset calls', async () => {
  const fetchImpl = reply(200, { email: 'ana@example.com', user: { email: 'ana@example.com', isAdmin: false }, ok: true });
  const api = createApi(fetchImpl);
  expect(await api.invite('tok')).toMatchObject({ email: 'ana@example.com' });
  await api.signup('tok', 'a long enough password');
  expect(await api.resetInfo('tok')).toMatchObject({ email: 'ana@example.com' });
  await api.reset('tok', 'a long enough password');
  expect(fetchImpl.mock.calls.map(([url, init]) => `${init.method} ${url}`)).toEqual([
    'GET /api/invite/tok', 'POST /api/signup', 'GET /api/reset/tok', 'POST /api/reset',
  ]);
});

test('listShared returns the recipes array; share and unshare use the recipe id', async () => {
  const fetchImpl = reply(200, { recipes: [{ id: 'x' }] });
  const api = createApi(fetchImpl);
  expect(await api.listShared()).toEqual([{ id: 'x' }]);
  expect(fetchImpl.mock.calls[0][0]).toBe('/api/shared');
  expect(fetchImpl.mock.calls[0][1].method).toBe('GET');
  await api.share('banana mash');
  expect(fetchImpl.mock.calls[1][0]).toBe('/api/shared');
  expect(fetchImpl.mock.calls[1][1].method).toBe('POST');
  expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ id: 'banana mash' });
  await api.unshare('banana mash');
  expect(fetchImpl.mock.calls[2][0]).toBe('/api/shared/banana%20mash');
  expect(fetchImpl.mock.calls[2][1].method).toBe('DELETE');
});

test('likeShared and unlikeShared hit the like path of the shared id', async () => {
  const fetchImpl = reply(200, { ok: true });
  const api = createApi(fetchImpl);
  await api.likeShared('abc');
  await api.unlikeShared('abc');
  expect(fetchImpl.mock.calls.map(([url, init]) => `${init.method} ${url}`)).toEqual([
    'POST /api/shared/abc/like', 'DELETE /api/shared/abc/like',
  ]);
});
