import { test, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import App from '../src/client/App.jsx';
import catalogs from '../src/client/i18n/catalogs.js';
import { setLanguage } from '../src/client/i18n/index.js';
import { createFakeApi } from './helpers/fakeApi.js';
import { englishLeft } from './helpers/i18n.js';
import { first, now } from './helpers/app.jsx';

afterEach(cleanup);

const OTHER_LANGUAGES = ['pt', 'es', 'de'];
const word = (language, key) => catalogs[language][key];

// Starts the app already in `language`, as a logged-in person who saved that language.
async function start(language, { birthdate = '2026-02-14', liked = [] } = {}) {
  setLanguage(language);
  const api = createFakeApi({ user: { email: 'ana@example.com', isAdmin: false, language }, birthdate });
  for (const recipe of liked) await api.like(recipe);
  render(<App api={api} now={now} path="/" navigate={vi.fn()} />);
  await screen.findByRole('button', { name: word(language, 'menu.button') });
  await waitFor(() => expect(screen.queryByText(word(language, 'common.loading'))).toBeNull());
  return api;
}

const openMenu = (language) => fireEvent.click(screen.getByRole('button', { name: word(language, 'menu.button') }));

test('the German menu button is Menü', async () => {
  await start('de');
  expect(screen.getByRole('button', { name: 'Menü' })).not.toBeNull();
});

test.each(OTHER_LANGUAGES)('the open menu is fully in %s', async (language) => {
  await start(language);
  openMenu(language);
  for (const key of ['menu.home', 'menu.liked', 'menu.community', 'menu.logout', 'menu.delete']) {
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

test.each(OTHER_LANGUAGES)('the birthday screen is fully in %s', async (language) => {
  await start(language, { birthdate: null });
  await screen.findByRole('heading', { name: word(language, 'setup.title') });
  expect(screen.getByLabelText(word(language, 'setup.birthday'))).not.toBeNull();
  expect(englishLeft(document.body, language, ['setup.'])).toEqual([]);
});

test('a future birthday is refused in German', async () => {
  await start('de', { birthdate: null });
  fireEvent.change(await screen.findByLabelText(word('de', 'setup.birthday')), { target: { value: '2099-01-01' } });
  fireEvent.click(screen.getByRole('button', { name: word('de', 'setup.continue') }));
  expect((await screen.findByRole('alert')).textContent).toBe('Der Geburtstag muss vor heute liegen');
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
