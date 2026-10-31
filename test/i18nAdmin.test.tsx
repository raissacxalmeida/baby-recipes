import { test, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import AdminScreen from '../src/client/screens/AdminScreen.jsx';
import catalogs from '../src/client/i18n/catalogs.js';
import type { CatalogKey } from '../src/client/i18n/en.js';
import type { Language } from '../src/shared/types.js';
import { setLanguage } from '../src/client/i18n/index.js';
import { asUser, createFakeApi, type FakeUser } from './helpers/fakeApi.js';
import type { AdminOverview } from '../src/client/apiTypes.js';
import { englishLeft } from './helpers/i18n.js';

afterEach(cleanup);

const OTHER_LANGUAGES: Language[] = ['pt', 'es', 'de'];
// The texts these tests look up are plain strings (none is a plural); a value fills its {slot} as replace() turns it into text.
const word = (language: Language, key: CatalogKey, params: Record<string, string | number> = {}) =>
  Object.entries(params).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), catalogs[language][key] as string);

const ADMIN: FakeUser = { email: 'me@example.com', isAdmin: true };
const overview = (): AdminOverview => ({
  limit: 10,
  invites: [
    { id: 'i1', email: 'ana@example.com', status: 'pending', daysLeft: 3, createdAt: '2026-10-15T08:00:00.000Z' },
    { id: 'i2', email: 'bia@example.com', status: 'pending', daysLeft: 1, createdAt: '2026-10-15T08:00:00.000Z' },
    { id: 'i3', email: 'maria@example.com', status: 'expired', daysLeft: null, createdAt: '2026-10-01T08:00:00.000Z' },
    { id: 'i4', email: 'joao@example.com', status: 'used', daysLeft: null, createdAt: '2026-10-12T08:00:00.000Z' },
  ],
  people: [
    { id: 'p0', email: 'me@example.com', isAdmin: true, joinedAt: '2026-10-10T08:00:00.000Z', lastLoginAt: '2026-10-15T08:00:00.000Z', recipesToday: null },
    { id: 'p1', email: 'joao@example.com', isAdmin: false, joinedAt: '2026-10-12T08:00:00.000Z', lastLoginAt: null, recipesToday: 3 },
  ],
});

async function open(language: Language) {
  setLanguage(language);
  const api = createFakeApi({ user: ADMIN, overrides: { admin: { overview: vi.fn(async () => overview()) } } });
  render(<AdminScreen api={api} me={asUser(ADMIN)} />);
  await screen.findByRole('table', { name: word(language, 'admin.people') });
  return api;
}

test.each(OTHER_LANGUAGES)('the admin page is fully in %s', async (language) => {
  await open(language);
  expect(screen.getByRole('heading', { name: word(language, 'admin.title') })).not.toBeNull();
  expect(screen.getByRole('heading', { name: word(language, 'admin.inviteSomeone') })).not.toBeNull();
  expect(screen.getByLabelText(word(language, 'admin.inviteEmail'))).not.toBeNull();
  expect(screen.getByRole('table', { name: word(language, 'admin.invites') })).not.toBeNull();
  expect(screen.getByRole('button', { name: word(language, 'admin.revokeLabel', { email: 'ana@example.com' }) })).not.toBeNull();
  expect(screen.getByRole('button', { name: word(language, 'admin.inviteAgainLabel', { email: 'maria@example.com' }) })).not.toBeNull();
  expect(screen.getByRole('button', { name: word(language, 'admin.resetLabel', { email: 'joao@example.com' }) })).not.toBeNull();
  expect(screen.getByRole('button', { name: word(language, 'admin.removeLabel', { email: 'joao@example.com' }) })).not.toBeNull();
  expect(screen.getByText(word(language, 'admin.usage', { used: 3, limit: 10 }))).not.toBeNull();
  expect(screen.getByText(word(language, 'admin.never'))).not.toBeNull();
  expect(englishLeft(document.body, language, ['admin.'])).toEqual([]);
});

test('the pending status counts days in German', async () => {
  await open('de');
  const invites = within(screen.getByRole('table', { name: 'Einladungen' }));
  expect(invites.getByText('Ausstehend (3 Tage übrig)')).not.toBeNull();
  expect(invites.getByText('Ausstehend (1 Tag übrig)')).not.toBeNull();
});

test.each(OTHER_LANGUAGES)('the remove dialog is fully in %s', async (language) => {
  await open(language);
  fireEvent.click(screen.getByRole('button', { name: word(language, 'admin.removeLabel', { email: 'joao@example.com' }) }));
  const dialog = await screen.findByRole('alertdialog');
  expect(within(dialog).getByText(word(language, 'admin.removeBody', { email: 'joao@example.com' }))).not.toBeNull();
  expect(englishLeft(dialog, language, ['admin.', 'common.cancel'])).toEqual([]);
});

test.each(OTHER_LANGUAGES)('a created invite link is shown in %s', async (language) => {
  await open(language);
  fireEvent.change(screen.getByLabelText(word(language, 'admin.inviteEmail')), { target: { value: 'new@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: word(language, 'admin.createInvite') }));
  expect(await screen.findByLabelText(word(language, 'admin.inviteLink', { email: 'new@example.com' }))).not.toBeNull();
  expect(screen.getByText(word(language, 'admin.shownOnce', { email: 'new@example.com' }))).not.toBeNull();
  expect(screen.getByRole('button', { name: word(language, 'admin.copy') })).not.toBeNull();
});

test('a person who is not the admin sees Not found in Spanish', () => {
  setLanguage('es');
  render(<AdminScreen api={createFakeApi()} me={asUser({ email: 'ana@example.com', isAdmin: false })} />);
  expect(screen.getByText('No encontrado')).not.toBeNull();
});
