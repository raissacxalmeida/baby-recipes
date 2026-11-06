import { test, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import App from '../src/client/App.jsx';
import catalogs from '../src/client/i18n/catalogs.js';
import type { CatalogKey } from '../src/client/i18n/en.js';
import type { Language } from '../src/shared/types.js';
import type { ApiRecipe } from '../src/client/apiTypes.js';
import { setLanguage } from '../src/client/i18n/index.js';
import { createFakeApi } from './helpers/fakeApi.js';
import { englishLeft } from './helpers/i18n.js';
import { first, now } from './helpers/app.jsx';

afterEach(cleanup);

const OTHER_LANGUAGES: Language[] = ['pt', 'es', 'de'];
// The texts these tests look up are plain strings (none is a plural).
const word = (language: Language, key: CatalogKey) => catalogs[language][key] as string;

// Starts the app already in `language`, as a logged-in person who saved that language.
async function start(language: Language, { birthdate = '2026-02-14', liked = [] }: { birthdate?: string | null; liked?: ApiRecipe[] } = {}) {
  setLanguage(language);
  const api = createFakeApi({ user: { email: 'ana@example.com', isAdmin: false, language }, birthdate });
  for (const recipe of liked) await api.like(recipe);
  render(<App api={api} now={now} path="/" navigate={vi.fn()} />);
  await screen.findByRole('button', { name: word(language, 'menu.button') });
  await waitFor(() => expect(screen.queryByText(word(language, 'common.loading'))).toBeNull());
  return api;
}

const openMenu = (language: Language) => fireEvent.click(screen.getByRole('button', { name: word(language, 'menu.button') }));

test('the German menu button is Menü', async () => {
  await start('de');
  expect(screen.getByRole('button', { name: 'Menü' })).not.toBeNull();
});

test.each(OTHER_LANGUAGES)('the open menu is fully in %s', async (language) => {
  await start(language);
  openMenu(language);
  for (const key of ['menu.ideas', 'menu.liked', 'menu.community', 'menu.logout', 'menu.delete'] satisfies CatalogKey[]) {
    expect(screen.getByRole('button', { name: word(language, key) }), key).not.toBeNull();
  }
  expect(englishLeft(document.body, language, ['menu.', 'common.cancel'])).toEqual([]);
});

test.each(OTHER_LANGUAGES)('the delete-account dialog is fully in %s', async (language) => {
  await start(language);
  openMenu(language);
  fireEvent.click(screen.getByRole('button', { name: word(language, 'menu.delete') }));
  const dialog = await screen.findByRole('alertdialog');
  expect(within(dialog).getByText(word(language, 'menu.deleteBody').replace('{email}', 'ana@example.com'))).not.toBeNull();
  expect(within(dialog).getByRole('button', { name: word(language, 'common.cancel') })).not.toBeNull();
  expect(within(dialog).getByRole('button', { name: word(language, 'menu.deleteConfirm') })).not.toBeNull();
  expect(englishLeft(dialog, language, ['menu.', 'common.cancel'])).toEqual([]);
});

test.each(OTHER_LANGUAGES)('the first baby screen is fully in %s', async (language) => {
  await start(language, { birthdate: null });
  await screen.findByRole('heading', { name: word(language, 'baby.titleFirst') });
  expect(screen.getByLabelText(word(language, 'baby.name'))).not.toBeNull();
  expect(screen.getByLabelText(word(language, 'baby.birthday'))).not.toBeNull();
  expect(englishLeft(document.body, language, ['baby.', 'menu.'])).toEqual([]);
});

test.each(OTHER_LANGUAGES)('a baby with no name is asked for it in %s, and the menu calls it by the unnamed text', async (language) => {
  setLanguage(language);
  const api = createFakeApi({ user: { email: 'ana@example.com', isAdmin: false, language }, babies: [{ id: 'baby-1', name: null, birthdate: '2026-02-14' }] });
  render(<App api={api} now={now} path="/" navigate={vi.fn()} />);
  await screen.findByRole('heading', { name: word(language, 'baby.titleEdit') });
  openMenu(language);
  expect(screen.getByRole('group', { name: word(language, 'baby.unnamed') })).not.toBeNull();
  expect(englishLeft(document.body, language, ['baby.', 'menu.'])).toEqual([]);
});

test('a future birthday is refused in German', async () => {
  await start('de', { birthdate: null });
  fireEvent.change(await screen.findByLabelText(word('de', 'baby.name')), { target: { value: 'Mia' } });
  fireEvent.change(screen.getByLabelText(word('de', 'baby.birthday')), { target: { value: '2099-01-01' } });
  fireEvent.click(screen.getByRole('button', { name: word('de', 'baby.save') }));
  expect((await screen.findByRole('alert')).textContent).toBe('Der Geburtstag muss vor heute liegen');
});

test('a name that is too long is refused in Portuguese', async () => {
  await start('pt', { birthdate: null });
  fireEvent.change(await screen.findByLabelText(word('pt', 'baby.name')), { target: { value: 'M'.repeat(31) } });
  fireEvent.change(screen.getByLabelText(word('pt', 'baby.birthday')), { target: { value: '2026-02-14' } });
  fireEvent.click(screen.getByRole('button', { name: word('pt', 'baby.save') }));
  expect((await screen.findByRole('alert')).textContent).toBe('Informe um nome de 1 a 30 caracteres');
});

test.each(OTHER_LANGUAGES)('the too-young screen is fully in %s', async (language) => {
  await start(language, { birthdate: '2026-08-01' });
  await screen.findByRole('heading', { name: word(language, 'tooYoung.title') });
  expect(screen.getByRole('button', { name: word(language, 'tooYoung.change') })).not.toBeNull();
  expect(englishLeft(document.body, language, ['tooYoung.'])).toEqual([]);
});

test.each(OTHER_LANGUAGES)('the back button of an opened recipe is in %s', async (language) => {
  await start(language, { liked: [first] });
  openMenu(language);
  fireEvent.click(screen.getByRole('button', { name: word(language, 'menu.liked') }));
  const [open] = await screen.findAllByRole('button', { name: /Banana mash/ });
  fireEvent.click(open);
  expect(await screen.findByRole('button', { name: new RegExp(word(language, 'recipe.backLiked')) })).not.toBeNull();
});
