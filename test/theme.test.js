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

const tokens = Object.fromEntries(
  [...readFileSync('src/client/style.css', 'utf8').matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1], m[2]]),
);
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const ERROR_NOTICE_BACKGROUND = '#fdeae5'; // bg-[#fdeae5] in components/ui/notice.jsx

test('button labels meet 4.5:1 contrast', () => {
  expect(contrast(tokens['primary-foreground'], tokens.primary)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(tokens['destructive-foreground'], tokens.destructive)).toBeGreaterThanOrEqual(4.5);
});

test('error and destructive text meets 4.5:1 on the page, card and error notice backgrounds', () => {
  for (const background of [tokens.background, tokens.card, ERROR_NOTICE_BACKGROUND]) {
    expect(contrast(tokens.destructive, background)).toBeGreaterThanOrEqual(4.5);
  }
});

test('the focus ring meets 3:1 on the page and card backgrounds', () => {
  for (const background of [tokens.background, tokens.card]) {
    expect(contrast(tokens.ring, background)).toBeGreaterThanOrEqual(3);
  }
});

const lower = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.toLowerCase()]));

test('the palette is the Sky blue palette', () => {
  expect(lower(tokens)).toMatchObject(lower({
    background: '#F4F8FD', foreground: '#243449', card: '#ffffff', border: '#DCE7F4', input: '#D3E1F2',
    primary: '#8FB1DB', 'primary-edge': '#6B90C0', 'primary-foreground': '#1F2F46',
    chip: '#DCE8F7', note: '#EEF4FB', 'note-border': '#CFDFF2',
  }));
});

test('the red for errors is unchanged', () => {
  expect(tokens.destructive.toLowerCase()).toBe('#bf3a1f');
  expect(tokens['destructive-foreground'].toLowerCase()).toBe('#ffffff');
});

test('body text meets 4.5:1 on the page and card', () => {
  for (const background of [tokens.background, tokens.card]) {
    expect(contrast(tokens.foreground, background)).toBeGreaterThanOrEqual(4.5);
  }
});

test('muted text meets 4.5:1 on the page, card, muted and note backgrounds', () => {
  for (const background of [tokens.background, tokens.card, tokens.muted, tokens.note]) {
    expect(contrast(tokens['muted-foreground'], background)).toBeGreaterThanOrEqual(4.5);
  }
});

test('the warm badge text meets 4.5:1 and its background differs from the default badge', () => {
  expect(contrast(tokens['warm-foreground'], tokens.warm)).toBeGreaterThanOrEqual(4.5);
  expect(tokens.warm.toLowerCase()).not.toBe(tokens.chip.toLowerCase());
});

test('no orange is left in the theme files', () => {
  const old = ['#fff8ef', '#f08a3c', '#c96a22', '#f3e3cc', '#7a6650', '#3b2a1a', '#f0dfc8', '#e8d3b5', '#ffe1bd', '#fff1e0', '#f5d3a8', '#fff1cc', '#8a5a00', '180, 120, 40'];
  for (const file of ['src/client/style.css', 'tailwind.config.js']) {
    const text = readFileSync(file, 'utf8').toLowerCase();
    expect(old.filter((c) => text.includes(c)), file).toEqual([]);
  }
});
