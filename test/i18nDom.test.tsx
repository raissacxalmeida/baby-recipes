import { test, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { getLanguage, setLanguage, t, useLanguage } from '../src/client/i18n/index.js';

afterEach(() => vi.restoreAllMocks());

test('setLanguage sets the page language and remembers the choice', () => {
  setLanguage('de');
  expect(document.documentElement.lang).toBe('de');
  expect(localStorage.getItem('language')).toBe('de');
});

test('an unsupported language changes nothing', () => {
  setLanguage('pt');
  setLanguage('xx');
  expect(getLanguage()).toBe('pt');
  expect(document.documentElement.lang).toBe('pt');
});

test('a browser that refuses to store anything still switches', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  setLanguage('pt');
  expect(getLanguage()).toBe('pt');
});

test('a component using useLanguage re-renders when the language changes', () => {
  function Probe() {
    useLanguage();
    return <p>{t('language.label')}</p>;
  }
  render(<Probe />);
  expect(screen.getByText('Language')).not.toBeNull();
  act(() => setLanguage('de'));
  expect(screen.getByText('Sprache')).not.toBeNull();
});
