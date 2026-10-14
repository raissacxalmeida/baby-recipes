import { test, expect } from 'vitest';
import { ageInMonths } from '../src/shared/age.js';

const now = new Date(2026, 9, 14);

test('8 months old', () => expect(ageInMonths('2026-02-14', now)).toBe(8));
test('day before the month completes', () => expect(ageInMonths('2026-02-15', now)).toBe(7));
test.each(['2027-01-01', '2026-10-14', '31/02/2026', '2026-02-31', ''])('rejects %s', (d) =>
  expect(() => ageInMonths(d, now)).toThrow(/birthday/));
