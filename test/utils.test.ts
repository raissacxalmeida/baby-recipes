import { test, expect } from 'vitest';
import { cn } from '../src/client/lib/utils.js';

test('cn joins class names and lets the later Tailwind utility win', () => {
  expect(cn('a', false && 'b', 'px-2', 'px-4')).toBe('a px-4');
});
