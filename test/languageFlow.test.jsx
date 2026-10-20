import { test, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import App from '../src/client/App.jsx';
import { createFakeApi } from './helpers/fakeApi.js';
import { detectLanguage, getLanguage } from '../src/client/i18n/index.js';
import { now } from './helpers/app.jsx';

afterEach(cleanup);

const pick = (name) => fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name }));

test('a visitor picks German, logs into a Portuguese account, switches to Spanish, logs out and comes back', async () => {
  const api = createFakeApi({
    birthdate: '2026-02-14',
    overrides: { login: vi.fn(async (email) => ({ email, isAdmin: false, language: 'pt' })) },
  });
  render(<App api={api} now={now} path="/" navigate={vi.fn()} />);

  // Logged out: the visitor picks German.
  await screen.findByRole('heading', { name: 'Log in' });
  pick('Deutsch');
  await screen.findByRole('heading', { name: 'Anmelden' });

  // Logging in: the language saved on the account (Portuguese) wins and nothing is saved back.
  fireEvent.change(screen.getByLabelText('E-Mail'), { target: { value: 'ana@example.com' } });
  fireEvent.change(screen.getByLabelText('Passwort'), { target: { value: 'a long enough password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Anmelden' }));
  await screen.findByRole('heading', { name: 'O que tem na geladeira?' });
  expect(getLanguage()).toBe('pt');
  expect(api.setLanguage).not.toHaveBeenCalled();
  expect(document.documentElement.lang).toBe('pt');

  // Logged in: the footer switches to Spanish and saves it on the account.
  pick('Español');
  await screen.findByRole('heading', { name: '¿Qué hay en la nevera?' });
  expect(api.setLanguage).toHaveBeenCalledWith('es');
  expect(screen.getByRole('button', { name: 'Menú' })).not.toBeNull();

  // Logging out keeps the language.
  fireEvent.click(screen.getByRole('button', { name: 'Menú' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
  await screen.findByRole('heading', { name: 'Iniciar sesión' });

  // A fresh page load in the same browser starts in the remembered language.
  expect(detectLanguage({ stored: localStorage.getItem('language'), languages: ['en'] })).toBe('es');
  cleanup();
  render(<App api={createFakeApi()} now={now} path="/" navigate={vi.fn()} />);
  await screen.findByRole('heading', { name: 'Iniciar sesión' });
  await waitFor(() => expect(getLanguage()).toBe('es'));
});
