import { test, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

test('the page title is Tiny Pantry', () => {
  expect(readFileSync('index.html', 'utf8')).toContain('<title>Tiny Pantry</title>');
});

test('the page links the favicon', () => {
  expect(readFileSync('index.html', 'utf8')).toMatch(/<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg"/);
});

test('the favicon is the logo mark with a thicker stem for tab size', () => {
  expect(existsSync('public/favicon.svg')).toBe(true);
  const svg = readFileSync('public/favicon.svg', 'utf8');
  expect(svg).toContain('viewBox="0 0 120 120"');
  expect(svg).toContain('#F6B9A6');
  expect(svg).toContain('#8DB59A');
  expect(svg).toContain('stroke-width="6"');
});

test('the README is titled Tiny Pantry', () => {
  expect(readFileSync('README.md', 'utf8').split('\n')[0]).toBe('# Tiny Pantry');
});

test('the OpenAI prompt keeps its wording', () => {
  expect(readFileSync('src/server/openai.js', 'utf8')).toContain('writes simple baby recipes');
});
