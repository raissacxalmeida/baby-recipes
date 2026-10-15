import { test, expect } from 'vitest';
import { loadConfig } from '../src/server/config.js';

const base = { DATABASE_URL: 'postgres://u:p@db:5432/x', PUBLIC_URL: 'http://my-mac.local:3000' };

test('missing DATABASE_URL and PUBLIC_URL are both named in one error', () => {
  expect(() => loadConfig({})).toThrow(/DATABASE_URL.*PUBLIC_URL/);
});

test('PUBLIC_URL must be an http(s) address', () => {
  expect(() => loadConfig({ ...base, PUBLIC_URL: 'ftp://x' })).toThrow(/PUBLIC_URL/);
  expect(() => loadConfig({ ...base, PUBLIC_URL: 'not a url' })).toThrow(/PUBLIC_URL/);
});

test('the trailing slash is removed and the public host is allowed with localhost', () => {
  const c = loadConfig({ ...base, PUBLIC_URL: 'http://my-mac.local:3000/' });
  expect(c.publicUrl).toBe('http://my-mac.local:3000');
  expect(c.allowedHosts).toEqual(['my-mac.local', 'localhost', '127.0.0.1']);
});

test('ALLOWED_HOSTS overrides the default', () => {
  expect(loadConfig({ ...base, ALLOWED_HOSTS: ' a.test, b.test ' }).allowedHosts).toEqual(['a.test', 'b.test']);
});

test('cookieSecure is only true for the exact word true', () => {
  expect(loadConfig({ ...base, COOKIE_SECURE: 'true' }).cookieSecure).toBe(true);
  expect(loadConfig({ ...base, COOKIE_SECURE: 'false' }).cookieSecure).toBe(false);
  expect(loadConfig(base).cookieSecure).toBe(false);
});

test('port and key defaults', () => {
  expect(loadConfig(base)).toMatchObject({ port: 3000, openaiKey: '', databaseUrl: base.DATABASE_URL });
  expect(loadConfig({ ...base, PORT: '8080', OPENAI_API_KEY: 'k' })).toMatchObject({ port: 8080, openaiKey: 'k' });
});
