import { test, expect } from 'vitest';
import { createTranslator } from '../src/client/i18n/translate.js';
import { detectLanguage, setLanguage, t } from '../src/client/i18n/index.js';

test('a stored language wins over the browser languages', () => {
  expect(detectLanguage({ stored: 'de', languages: ['pt-BR'] })).toBe('de');
});

test('without a stored language the first supported browser language is used', () => {
  expect(detectLanguage({ stored: null, languages: ['fr-FR', 'pt-BR', 'en'] })).toBe('pt');
});

test('unsupported or missing languages fall back to English', () => {
  expect(detectLanguage({ stored: 'xx', languages: ['fr'] })).toBe('en');
  expect(detectLanguage({})).toBe('en');
});

const translate = createTranslator({
  en: { a: 'Hi {name}', n: { one: '{count} cat', other: '{count} cats' }, only: 'Only en' },
  pt: { a: 'Oi {name}' },
});

test('slots are filled in', () => {
  expect(translate('pt', 'a', { name: 'Ana' })).toBe('Oi Ana');
});

test('a key missing from a language falls back to English', () => {
  expect(translate('pt', 'only')).toBe('Only en');
});

test('plural entries follow the language rules', () => {
  expect(translate('en', 'n', { count: 1 })).toBe('1 cat');
  expect(translate('en', 'n', { count: 3 })).toBe('3 cats');
});

test('an unknown key comes back as the key and an unfilled slot stays as written', () => {
  expect(translate('en', 'missing')).toBe('missing');
  expect(translate('en', 'a')).toBe('Hi {name}');
});

test.each([
  ['en', 1, '1 month'], ['en', 8, '8 months'],
  ['pt', 1, '1 mês'], ['pt', 8, '8 meses'],
  ['es', 1, '1 mes'], ['es', 8, '8 meses'],
  ['de', 1, '1 Monat'], ['de', 8, '8 Monate'],
])('the real catalog gives %s count %i as %s', (language, count, expected) => {
  setLanguage(language);
  expect(t('age.months', { count })).toBe(expected);
});
