import { test, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import App from '../src/client/App.jsx';
import { createFakeApi } from './helpers/fakeApi.js';
import { getLanguage, setLanguage } from '../src/client/i18n/index.js';
import { now } from './helpers/app.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const MENU = /^Men[uúü]$/;
const ana = (extra = {}) => ({ email: 'ana@example.com', isAdmin: false, language: null, ...extra });
const nav = (name) => (name ? screen.getByRole('navigation', { name }) : screen.getByRole('navigation'));
const pick = (name) => fireEvent.click(within(nav()).getByRole('button', { name }));

// Renders the app and waits for its first real screen: the menu when logged in, the switch when not.
async function show({ user = null, path = '/', overrides } = {}) {
  const api = createFakeApi({ user, birthdate: '2026-02-14', overrides });
  render(<App api={api} now={now} path={path} navigate={vi.fn()} />);
  if (user) await screen.findByRole('button', { name: MENU });
  else await screen.findByRole('navigation');
  return api;
}

test('the footer lists the four languages and marks the current one', async () => {
  await show();
  expect(nav('Language')).not.toBeNull();
  const names = within(nav()).getAllByRole('button').map((b) => b.textContent);
  expect(names).toEqual(['English', 'Português', 'Español', 'Deutsch']);
  expect(within(nav()).getByRole('button', { name: 'English' }).getAttribute('aria-current')).toBe('true');
  expect(within(nav()).getByRole('button', { name: 'Deutsch' }).getAttribute('aria-current')).toBeNull();
});

test('logged out, picking a language switches the page and is remembered in the browser only', async () => {
  const api = await show();
  pick('Deutsch');
  expect(getLanguage()).toBe('de');
  expect(localStorage.getItem('language')).toBe('de');
  expect(document.documentElement.lang).toBe('de');
  expect(nav('Sprache')).not.toBeNull();
  expect(api.setLanguage).not.toHaveBeenCalled();
});

test('after login the language saved on the account wins over the browser choice', async () => {
  setLanguage('de');
  await show({ user: ana({ language: 'es' }) });
  await waitFor(() => expect(getLanguage()).toBe('es'));
});

test('an account with no language keeps the one showing and saves it', async () => {
  setLanguage('de');
  const api = await show({ user: ana() });
  await waitFor(() => expect(api.setLanguage).toHaveBeenCalledWith('de'));
  expect(api.setLanguage).toHaveBeenCalledTimes(1);
  expect(getLanguage()).toBe('de');
});

test('logged in, picking a language saves it on the account', async () => {
  const api = await show({ user: ana({ language: 'en' }) });
  pick('Português');
  await waitFor(() => expect(api.setLanguage).toHaveBeenCalledWith('pt'));
  expect(getLanguage()).toBe('pt');
});

test('a failed save is silent and the language still switches', async () => {
  const setLanguageApi = vi.fn().mockRejectedValue(new Error('offline'));
  await show({ user: ana({ language: 'en' }), overrides: { setLanguage: setLanguageApi } });
  pick('Português');
  await waitFor(() => expect(setLanguageApi).toHaveBeenCalledWith('pt'));
  expect(getLanguage()).toBe('pt');
  expect(screen.queryByRole('alert')).toBeNull();
});

test('a saved language this browser does not know is treated as none', async () => {
  const api = await show({ user: ana({ language: 'xx' }) });
  await waitFor(() => expect(api.setLanguage).toHaveBeenCalledWith('en'));
  expect(getLanguage()).toBe('en');
});

test.each(['/invite/tok', '/reset/tok'])('the switch is on %s', async (path) => {
  await show({ path });
  expect(nav()).not.toBeNull();
});

test('the switch is on the admin page', async () => {
  await show({ user: ana({ isAdmin: true, language: 'en' }), path: '/admin' });
  expect(nav()).not.toBeNull();
});

test('a browser that refuses to store anything still switches', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  await show();
  pick('Deutsch');
  expect(getLanguage()).toBe('de');
});

test('logging out keeps the language', async () => {
  await show({ user: ana({ language: 'pt' }) });
  await waitFor(() => expect(getLanguage()).toBe('pt'));
  fireEvent.click(screen.getByRole('button', { name: MENU }));
  fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: MENU })).toBeNull());
  expect(getLanguage()).toBe('pt');
});

test('switching language keeps what the person has typed', async () => {
  await show({ user: ana({ language: 'en' }) });
  const input = await screen.findByLabelText('Ingredient');
  fireEvent.change(input, { target: { value: 'banana' } });
  pick('Deutsch');
  expect(input.isConnected).toBe(true);
  expect(input.value).toBe('banana');
});
