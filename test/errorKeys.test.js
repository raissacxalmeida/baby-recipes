import { test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestServer } from './helpers/http.js';
import { AppError } from '../src/server/errors.js';
import { createInvite } from '../src/server/users.js';

let t;

beforeAll(async () => { t = await startTestServer(); });
afterAll(() => t.close());
beforeEach(async () => { await t.db.reset(); });

test('an AppError carries the key and values it was given', () => {
  const err = new AppError('invalid-input', 'Too short', { key: 'err.passwordShort', params: { min: 10 } });
  expect(err).toMatchObject({ code: 'invalid-input', message: 'Too short', key: 'err.passwordShort', params: { min: 10 } });
  expect(new AppError('not-found', 'Gone').key).toBeUndefined();
});

test('a wrong password answers with the message and its key', async () => {
  await t.addUser('ana@example.com');
  const res = await t.call('POST', '/api/login', { email: 'ana@example.com', password: 'not the password' });
  expect(res.status).toBe(401);
  expect(res.body).toEqual({ error: 'unauthorized', message: 'Wrong email or password', key: 'err.wrongLogin' });
});

test('a short password answers with the key and the minimum length', async () => {
  const { token } = await createInvite(t.db, 'bia@example.com', t.now);
  const res = await t.call('POST', '/api/signup', { token, password: 'short' });
  expect(res.status).toBe(400);
  expect(res.body).toMatchObject({ key: 'err.passwordShort', params: { min: 10 } });
});

test('a bad birthday keeps the key of the shared age check', async () => {
  const jar = await t.loginAsNew('ana@example.com');
  const res = await t.call('PUT', '/api/birthdate', { birthdate: 'not-a-date' }, jar);
  expect(res.status).toBe(400);
  expect(res.body.key).toBe('err.birthdayFormat');
  const future = await t.call('PUT', '/api/birthdate', { birthdate: '2099-01-01' }, jar);
  expect(future.body.key).toBe('err.birthdayFuture');
});

test('the daily limit message names the reset time as a value', async () => {
  const jar = await t.loginAsNew('ana@example.com');
  await t.call('PUT', '/api/birthdate', { birthdate: '2026-03-14' }, jar);
  t.setModel(async () => ({
    title: 'Banana mash', basePortions: 2, ingredients: [{ name: 'banana', grams: 100 }],
    steps: ['Mash the banana.'], texture: 'mashed', allergens: [],
  }));
  let res;
  for (let n = 0; n < 12; n++) {
    t.setModel(async () => ({
      title: `Recipe ${n}`, basePortions: 2, ingredients: [{ name: 'banana', grams: 100 }],
      steps: ['Mash the banana.'], texture: 'mashed', allergens: [],
    }));
    res = await t.call('POST', '/api/recipe', { ingredients: [`fruit${n}`] }, jar);
    if (res.status === 429) break;
  }
  expect(res.status).toBe(429);
  expect(res.body.key).toBe('err.limitReached');
  expect(res.body.params.time).toMatch(/^\d{2}:\d{2}$/);
});

test('an error with no translation key has none in the reply', async () => {
  const res = await fetch(`${t.base}/api/liked`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
  const body = await res.json();
  expect(res.status).toBe(400);
  expect(body).toEqual({ error: 'invalid-input', message: 'Missing X-Requested-With header' });
});
