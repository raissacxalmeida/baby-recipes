import { test, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import catalogs from '../src/client/i18n/catalogs.js';
import { LANGUAGES } from '../src/shared/languages.js';

const keysOf = (language) => Object.keys(catalogs[language]).sort();
const variants = (entry) => (typeof entry === 'string' ? [entry] : Object.values(entry));
const slotsOf = (entry) => [...new Set(variants(entry).flatMap((s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1])))].sort();

function filesUnder(dir, extensions) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesUnder(path, extensions);
    return extensions.some((e) => path.endsWith(e)) ? [path] : [];
  });
}

const literalsIn = (dir, extensions, pattern) =>
  filesUnder(dir, extensions).flatMap((file) => [...readFileSync(file, 'utf8').matchAll(pattern)].map((m) => m[1]));

test.each(LANGUAGES)('%s has exactly the keys English has', (language) => {
  expect(keysOf(language)).toEqual(keysOf('en'));
});

test.each(LANGUAGES)('%s has no empty text', (language) => {
  for (const [key, entry] of Object.entries(catalogs[language])) {
    for (const text of variants(entry)) expect(text.trim(), `${language} ${key}`).not.toBe('');
  }
});

test('every key uses the same slots in all four languages', () => {
  for (const key of keysOf('en')) {
    for (const language of LANGUAGES) {
      expect(slotsOf(catalogs[language][key]), `${language} ${key}`).toEqual(slotsOf(catalogs.en[key]));
    }
  }
});

test('plural entries have one and other, both with the count, in every language', () => {
  for (const key of keysOf('en')) {
    if (typeof catalogs.en[key] === 'string') continue;
    for (const language of LANGUAGES) {
      const entry = catalogs[language][key];
      expect(typeof entry, `${language} ${key}`).toBe('object');
      expect(Object.keys(entry).sort(), `${language} ${key}`).toEqual(['one', 'other']);
      expect(entry.one, `${language} ${key}`).toContain('{count}');
      expect(entry.other, `${language} ${key}`).toContain('{count}');
    }
  }
});

test('every key the client asks for exists in English', () => {
  const used = literalsIn('src/client', ['.js', '.jsx'], /\bt\(\s*'([^']+)'/g);
  for (const key of used) expect(catalogs.en, key).toHaveProperty([key]);
});

test('every key the server and shared code send exists in English', () => {
  const sent = [
    ...literalsIn('src/server', ['.js'], /\bkey:\s*'([^']+)'/g),
    ...literalsIn('src/shared', ['.js'], /\bkey:\s*'([^']+)'/g),
  ];
  for (const key of sent) expect(catalogs.en, key).toHaveProperty([key]);
});
