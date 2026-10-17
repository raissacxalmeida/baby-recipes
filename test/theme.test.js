import { test, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? files(path) : [path];
});

// The palette colours are plain CSS variables, so Tailwind v3 silently emits nothing for `/NN` opacity suffixes.
test('no opacity suffix is used on the CSS-variable palette colours', () => {
  const token = '(?:background|foreground|card|border|input|primary|muted|destructive|ring|chip|note|warm)(?:-[a-z]+)?';
  const suffixed = new RegExp(`(?:bg|text|border|ring|shadow|fill|stroke|placeholder|divide|outline)-${token}/\\d+`, 'g');
  const hits = files('src/client')
    .filter((f) => /\.(jsx?|css)$/.test(f))
    .flatMap((f) => (readFileSync(f, 'utf8').match(suffixed) ?? []).map((m) => `${f}: ${m}`));
  expect(hits).toEqual([]);
});
