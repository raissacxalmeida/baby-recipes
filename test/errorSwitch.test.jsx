import { test, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import App from '../src/client/App.jsx';
import SetupScreen from '../src/client/screens/SetupScreen.jsx';
import { createApi } from '../src/client/api.js';
import { t, setLanguage } from '../src/client/i18n/index.js';
import { createFakeApi } from './helpers/fakeApi.js';
import { now } from './helpers/app.jsx';

afterEach(cleanup);

const pick = (name) => fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name }));

test('an error already on screen changes language with the page', async () => {
  const wrong = Object.assign(new Error('Wrong email or password'), { status: 401, key: 'err.wrongLogin' });
  const api = createFakeApi({ overrides: { login: vi.fn().mockRejectedValue(wrong) } });
  render(<App api={api} now={now} path="/" navigate={vi.fn()} />);
  fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'ana@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'nope' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Wrong email or password');
  pick('Deutsch');
  expect(screen.getByRole('alert').textContent).toBe('Falsche E-Mail-Adresse oder falsches Passwort');
});

test('the session-ended notice changes language with the page', async () => {
  const lost = vi.fn().mockRejectedValue(Object.assign(new Error('gone'), { status: 401 }));
  const api = createFakeApi({ user: { email: 'ana@example.com', isAdmin: false, language: 'en' }, birthdate: '2026-02-14', overrides: { state: lost } });
  render(<App api={api} now={now} path="/" navigate={vi.fn()} />);
  expect(await screen.findByText('Your session ended. Please log in again.')).not.toBeNull();
  pick('Español');
  expect(screen.getByText('Tu sesión terminó. Inicia sesión de nuevo.')).not.toBeNull();
});

test('a short-password error on the signup page changes language with the page', async () => {
  render(<App api={createFakeApi()} now={now} path="/invite/tok" navigate={vi.fn()} />);
  fireEvent.change(await screen.findByLabelText('Choose a password'), { target: { value: 'abc' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Use a password with at least 10 characters');
  pick('Português');
  expect(screen.getByRole('alert').textContent).toBe('Use uma senha com pelo menos 10 caracteres');
});

test('the birthday screen shows the English message for a key this browser does not know, never the key', async () => {
  const unknown = Object.assign(new Error('Plain English'), { key: 'err.fromANewerServer' });
  render(<SetupScreen onSave={vi.fn().mockRejectedValue(unknown)} now={now} />);
  fireEvent.change(screen.getByLabelText("Baby's birthday"), { target: { value: '2026-03-14' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Plain English');
});

test('the api only keeps a key this browser has a text for, and keeps the values', async () => {
  const reply = (body) => vi.fn(async () => ({ ok: false, status: 400, json: async () => body }));
  const known = await createApi(reply({ error: 'invalid-input', message: 'm', key: 'err.passwordShort', params: { min: 10 } })).signup('t', 'x').catch((e) => e);
  expect(known).toMatchObject({ key: 'err.passwordShort', params: { min: 10 } });
  const unknown = await createApi(reply({ error: 'invalid-input', message: 'm', key: 'err.fromANewerServer' })).signup('t', 'x').catch((e) => e);
  expect(unknown.key).toBeUndefined();
  const offline = await createApi(async () => { throw new TypeError('x'); }).state().catch((e) => e);
  expect(offline.key).toBe('err.network');
});

test('Portuguese reads zero likes and zero days as plural', () => {
  setLanguage('pt');
  expect(t('shared.likes', { count: 0 })).toBe('0 curtidas');
  expect(t('shared.likes', { count: 1 })).toBe('1 curtida');
  expect(t('admin.pending', { count: 0 })).toBe('Pendente (0 dias restantes)');
});
