// @vitest-environment node
import { test, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, loadEnv } from '../src/server/server.js';
import http from 'node:http';
import { AppError } from '../src/server/errors.js';

let server;
let base;
let generate = async () => ({ id: 'x', title: 'X' });
const post = (body, raw = false) =>
  fetch(`${base}/api/recipe`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw ? body : JSON.stringify(body) });

beforeAll(async () => {
  const staticDir = mkdtempSync(join(tmpdir(), 'static-'));
  writeFileSync(join(staticDir, 'index.html'), '<h1>hello</h1>');
  writeFileSync(join(staticDir, '..', 'secret.txt'), 'secret');
  server = createServer({ generate: (i) => generate(i), staticDir });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => server.close());

test('POST returns the generated recipe', async () => {
  generate = async () => ({ id: 'banana-mash', title: 'Banana mash' });
  const res = await post({ birthdate: '2026-03-14', ingredients: ['banana'], exclude: [] });
  expect(res.status).toBe(200);
  expect((await res.json()).recipe.title).toBe('Banana mash');
});

test.each([
  ['too-young', 422], ['invalid-input', 400], ['generation-failed', 502], ['missing-key', 500], ['upstream-error', 502],
])('AppError %s maps to %i', async (code, status) => {
  generate = async () => { throw new AppError(code, 'msg'); };
  const res = await post({ birthdate: 'x', ingredients: [], exclude: [] });
  expect(res.status).toBe(status);
  expect(await res.json()).toEqual({ error: code, message: 'msg' });
});

test('unknown errors give a generic 500 without a stack', async () => {
  generate = async () => { throw new Error('secret internals'); };
  const res = await post({});
  expect(res.status).toBe(500);
  const text = await res.text();
  expect(text).not.toMatch(/secret internals|at /);
});

test('malformed JSON and oversized bodies give 400', async () => {
  expect((await post('{not json', true)).status).toBe(400);
  expect((await post(JSON.stringify({ pad: 'x'.repeat(200_000) }), true)).status).toBe(400);
});

test('serves index.html at /', async () => {
  const res = await fetch(`${base}/`);
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toMatch(/text\/html/);
  expect(await res.text()).toBe('<h1>hello</h1>');
});

test('missing file and traversal attempts give 404', async () => {
  expect((await fetch(`${base}/nope.js`)).status).toBe(404);
  expect((await fetch(`${base}/..%2fsecret.txt`)).status).toBe(404);
  expect((await fetch(`${base}/%2e%2e/secret.txt`)).status).toBe(404);
});

test('POST without a JSON content type is refused', async () => {
  const res = await fetch(`${base}/api/recipe`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
  expect(res.status).toBe(415);
});

test('a foreign Host header is refused', async () => {
  const status = await new Promise((resolve, reject) => {
    const req = http.request(base, { headers: { Host: 'evil.example' } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.end();
  });
  expect(status).toBe(403);
});

test('a raw path traversal request gets 404', async () => {
  const status = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: '/../secret.txt' }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.end();
  });
  expect(status).toBe(404);
});

test('loadEnv strips surrounding quotes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'env-'));
  const file = join(dir, '.env');
  writeFileSync(file, 'BABY_TEST_Q="sk-abc"\nBABY_TEST_R=\'sk-def\'\n');
  delete process.env.BABY_TEST_Q;
  delete process.env.BABY_TEST_R;
  loadEnv(file);
  expect(process.env.BABY_TEST_Q).toBe('sk-abc');
  expect(process.env.BABY_TEST_R).toBe('sk-def');
});

test('loadEnv reads a file but does not override existing variables', () => {
  const dir = mkdtempSync(join(tmpdir(), 'env-'));
  const file = join(dir, '.env');
  writeFileSync(file, 'BABY_TEST_A=from-file\nBABY_TEST_B=from-file\n# comment\n');
  process.env.BABY_TEST_B = 'already';
  delete process.env.BABY_TEST_A;
  loadEnv(file);
  expect(process.env.BABY_TEST_A).toBe('from-file');
  expect(process.env.BABY_TEST_B).toBe('already');
  expect(() => loadEnv(join(dir, 'missing'))).not.toThrow();
});
