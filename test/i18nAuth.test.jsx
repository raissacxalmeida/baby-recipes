import { test, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import App from '../src/client/App.jsx';
import catalogs from '../src/client/i18n/catalogs.js';
import { setLanguage } from '../src/client/i18n/index.js';
import { createFakeApi } from './helpers/fakeApi.js';
import { englishLeft } from './helpers/i18n.js';
import { now } from './helpers/app.jsx';

afterEach(cleanup);

const PREFIXES = ['auth.', 'footer.', 'login.', 'signup.', 'reset.', 'common.loading'];
const OTHER_LANGUAGES = ['pt', 'es', 'de'];
const word = (language, key) => catalogs[language][key];

function renderAt(path, api = createFakeApi()) {
  render(<App api={api} now={now} path={path} navigate={vi.fn()} />);
  return api;
}

test.each(OTHER_LANGUAGES)('the login page is fully in %s', async (language) => {
  setLanguage(language);
  renderAt('/');
  await screen.findByRole('heading', { name: word(language, 'login.title') });
  expect(screen.getByLabelText(word(language, 'auth.email'))).not.toBeNull();
  expect(screen.getByLabelText(word(language, 'auth.password'))).not.toBeNull();
  expect(screen.getByText(word(language, 'footer.disclaimer'))).not.toBeNull();
  expect(englishLeft(document.body, language, PREFIXES)).toEqual([]);
});

test('the German login heading is Anmelden', async () => {
  setLanguage('de');
  renderAt('/');
  expect(await screen.findByRole('heading', { name: 'Anmelden' })).not.toBeNull();
});

test.each(OTHER_LANGUAGES)('the signup page is fully in %s', async (language) => {
  setLanguage(language);
  renderAt('/invite/tok');
  await screen.findByRole('heading', { name: word(language, 'signup.title') });
  expect(screen.getByText(word(language, 'signup.invitedAs').replace('{email}', 'ana@example.com'))).not.toBeNull();
  expect(englishLeft(document.body, language, PREFIXES)).toEqual([]);
});

test('a short password on the German signup page is refused in German', async () => {
  setLanguage('de');
  renderAt('/invite/tok');
  await screen.findByRole('heading', { name: word('de', 'signup.title') });
  fireEvent.change(screen.getByLabelText(word('de', 'signup.choosePassword')), { target: { value: 'abc' } });
  fireEvent.click(screen.getByRole('button', { name: word('de', 'signup.submit') }));
  expect((await screen.findByRole('alert')).textContent).toBe('Verwende ein Passwort mit mindestens 10 Zeichen');
});

test.each(OTHER_LANGUAGES)('the reset page is fully in %s', async (language) => {
  setLanguage(language);
  renderAt('/reset/tok');
  await screen.findByRole('heading', { name: word(language, 'reset.title') });
  expect(screen.getByText(word(language, 'reset.forEmail').replace('{email}', 'ana@example.com'))).not.toBeNull();
  expect(englishLeft(document.body, language, PREFIXES)).toEqual([]);
});

test('a short password on the Portuguese reset page is refused in Portuguese', async () => {
  setLanguage('pt');
  renderAt('/reset/tok');
  await screen.findByRole('heading', { name: word('pt', 'reset.title') });
  fireEvent.change(screen.getByLabelText(word('pt', 'reset.newPassword')), { target: { value: 'abc' } });
  fireEvent.click(screen.getByRole('button', { name: word('pt', 'reset.submit') }));
  expect((await screen.findByRole('alert')).textContent).toBe('Use uma senha com pelo menos 10 caracteres');
});

test('a changed password shows the done page in Spanish', async () => {
  setLanguage('es');
  renderAt('/reset/tok');
  await screen.findByRole('heading', { name: word('es', 'reset.title') });
  fireEvent.change(screen.getByLabelText(word('es', 'reset.newPassword')), { target: { value: 'a long enough password' } });
  fireEvent.click(screen.getByRole('button', { name: word('es', 'reset.submit') }));
  await screen.findByRole('heading', { name: word('es', 'reset.changedTitle') });
  expect(screen.getByRole('button', { name: word('es', 'reset.toLogin') })).not.toBeNull();
});

test('the session-ended notice is in the current language', async () => {
  setLanguage('de');
  const lost = vi.fn().mockRejectedValue(Object.assign(new Error('gone'), { status: 401 }));
  const api = createFakeApi({
    user: { email: 'ana@example.com', isAdmin: false, language: 'de' }, birthdate: '2026-02-14', overrides: { state: lost },
  });
  renderAt('/', api);
  expect(await screen.findByText(word('de', 'auth.sessionEnded'))).not.toBeNull();
});
