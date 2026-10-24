import { test, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import App from '../src/client/App.jsx';
import catalogs from '../src/client/i18n/catalogs.js';
import { setLanguage } from '../src/client/i18n/index.js';
import { createFakeApi } from './helpers/fakeApi.js';
import { first, goTo, make, now, second } from './helpers/app.jsx';

afterEach(cleanup);

const community = (recipe) => ({ id: `s-${recipe.id}`, recipe, group: 'Other', ageMonths: 8, likes: 0, mine: false, liked: false });

// An app for a parent who has already liked `liked` recipes, opened on the Home screen in English.
async function start({ liked = [], disliked = [], shared = [], overrides } = {}) {
  const api = createFakeApi({ user: { email: 'ana@example.com', isAdmin: false }, birthdate: '2026-02-14', shared, overrides });
  for (const r of liked) await api.like(r);
  for (const r of disliked) await api.dislike(r);
  render(<App api={api} now={now} path="/" navigate={vi.fn()} />);
  await screen.findByRole('button', { name: 'Menu' });
  await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull());
  return api;
}
const switchTo = (language) => act(async () => { setLanguage(language); });

test('English asks for no translation', async () => {
  const api = await start({ liked: [first] });
  goTo('Liked recipes');
  await screen.findByText('Banana mash');
  expect(api.translateTitles).not.toHaveBeenCalled();
});

test('after a switch to Portuguese every liked and disliked title shows in Portuguese, from one call', async () => {
  const api = await start({ liked: [first], disliked: [second] });
  goTo('Liked recipes');
  await switchTo('pt');
  await screen.findByText('pt:Banana mash');
  await screen.findByText('pt:Oat porridge');
  expect(api.translateTitles).toHaveBeenCalledTimes(1);
  expect(api.translateTitles.mock.calls[0][0]).toBe('pt');
  expect([...api.translateTitles.mock.calls[0][1]].sort()).toEqual(['Banana mash', 'Oat porridge']);
  const open = catalogs.pt['common.openLabel'].replace('{title}', 'pt:Banana mash');
  expect(screen.getByRole('button', { name: open })).not.toBeNull();
});

test('community titles are translated too', async () => {
  const api = await start({ shared: [community(first)] });
  goTo('Community recipes');
  await screen.findByText('Banana mash');
  await switchTo('es');
  await screen.findByText('es:Banana mash');
  expect(api.translateTitles).toHaveBeenCalledWith('es', ['Banana mash']);
});

test('titles that failed to translate stay English with no error shown', async () => {
  await start({ liked: [first], overrides: { translateTitles: vi.fn(async () => { throw new Error('nope'); }) } });
  goTo('Liked recipes');
  await switchTo('de');
  await waitFor(() => expect(screen.getByText('Banana mash')).not.toBeNull());
  expect(screen.queryByText('Something went wrong')).toBeNull();
  expect(screen.queryByText(catalogs.de['err.generic'])).toBeNull();
});

test('switching to another language on the same page fetches that language, and a title is asked for once per language', async () => {
  const api = await start({ liked: [first] });
  goTo('Liked recipes');
  await switchTo('pt');
  await screen.findByText('pt:Banana mash');
  await switchTo('de');
  await screen.findByText('de:Banana mash');
  await switchTo('pt');
  await screen.findByText('pt:Banana mash');
  expect(api.translateTitles.mock.calls.map(([language]) => language)).toEqual(['pt', 'de']);
});
