import { test, expect } from 'vitest';
import { hashPassword, verifyPassword, newToken, hashToken } from '../src/server/auth.js';

test('hashPassword is salted and verifyPassword checks it', async () => {
  const a = await hashPassword('correct horse battery');
  const b = await hashPassword('correct horse battery');
  expect(a).not.toBe(b);
  expect(a).not.toContain('correct horse');
  expect(await verifyPassword('correct horse battery', a)).toBe(true);
  expect(await verifyPassword('wrong password!', a)).toBe(false);
  expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
});

test('newToken is unique and 43 characters of base64url', () => {
  const tokens = new Set(Array.from({ length: 50 }, newToken));
  expect(tokens.size).toBe(50);
  for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
});

test('hashToken is stable and differs from the token', () => {
  const t = newToken();
  expect(hashToken(t)).toBe(hashToken(t));
  expect(hashToken(t)).not.toBe(t);
});
