import { test, expect } from 'vitest';
import { ingredientEmoji } from '../src/shared/ingredientEmoji.js';

test('finds the emoji regardless of case, spacing or a plural ending', () => {
  expect(ingredientEmoji('Carrot')).toBe('🥕');
  expect(ingredientEmoji('carrots')).toBe('🥕');
  expect(ingredientEmoji('  CARROTS ')).toBe('🥕');
  expect(ingredientEmoji('tomatoes')).toBe('🍅');
});

test('knows multi-word and common baby-food ingredients', () => {
  expect(ingredientEmoji('sweet potato')).toBe('🍠');
  expect(ingredientEmoji('broccoli')).toBe('🥦');
  expect(ingredientEmoji('banana')).toBe('🍌');
});

test('falls back to a bowl for unknown, empty or non-string input', () => {
  for (const value of ['dragonfruit-xyz', '', '   ', undefined, null, 42]) {
    expect(ingredientEmoji(value)).toBe('🥣');
  }
});

test('names that match inherited object keys fall back instead of returning non-strings', () => {
  for (const value of ['__proto__', 'constructor', 'constructors', 'toString', 'hasOwnProperty']) {
    expect(ingredientEmoji(value)).toBe('🥣');
  }
});
