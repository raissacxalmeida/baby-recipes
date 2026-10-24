import { test, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, act, fireEvent } from '@testing-library/react';
import App from '../src/client/App.jsx';
import catalogs from '../src/client/i18n/catalogs.js';
import { setLanguage } from '../src/client/i18n/index.js';
import { createFakeApi } from './helpers/fakeApi.js';
import { addIngredient, click, first, goTo, now, shown } from './helpers/app.jsx';

afterEach(cleanup);

async function start({ liked = [], overrides } = {}) {
  const api = createFakeApi({ user: { email: 'ana@example.com', isAdmin: false }, birthdate: '2026-02-14', recipes: [first], overrides });
  for (const r of liked) await api.like(r);
  render(<App api={api} now={now} path="/" navigate={vi.fn()} />);
  await screen.findByRole('button', { name: 'Menu' });
  await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull());
  return api;
}
const switchTo = (language) => act(async () => { setLanguage(language); });
const openFirst = () => { goTo('Liked recipes'); click('Open Banana mash'); };
const holdTranslation = () => {
  const held = {};
  const translateRecipe = vi.fn((language, recipe) => new Promise((resolve) => {
    held.release = () => resolve({ title: `${language}:${recipe.title}`, ingredients: [`${language}:banana`], steps: [`${language}:Mash it.`] });
  }));
  return { held, translateRecipe };
};

test('in Portuguese a saved recipe shows a notice, then the whole recipe translated together', async () => {
  const { held, translateRecipe } = holdTranslation();
  await start({ liked: [first], overrides: { translateRecipe } });
  await switchTo('pt');
  goTo(catalogs.pt['menu.liked']);
  click(catalogs.pt['common.openLabel'].replace('{title}', 'Banana mash'));
  await screen.findByText(catalogs.pt['recipe.translating']);
  expect(screen.queryByRole('heading', { name: 'Banana mash' })).toBeNull();
  expect(screen.queryByText('Mash it.')).toBeNull();
  await act(async () => { held.release(); });
  await shown('pt:Banana mash');
  expect(screen.getByText('pt:banana')).not.toBeNull();
  expect(screen.getByText('pt:Mash it.')).not.toBeNull();
  expect(screen.queryByText(catalogs.pt['recipe.translating'])).toBeNull();
});

test('a translated ingredient still gets the emoji of its English name', async () => {
  await start({ liked: [first] });
  goTo('Liked recipes');
  await switchTo('de');
  fireEvent.click(await screen.findByRole('button', { name: catalogs.de['common.openLabel'].replace('{title}', 'de:Banana mash') }));
  await shown('de:Banana mash');
  expect(screen.getByText('🍌')).not.toBeNull();
  expect(screen.queryByText('🥣')).toBeNull();
});

test('when the translation fails the English recipe shows and no error does', async () => {
  await start({ liked: [first], overrides: { translateRecipe: vi.fn(async () => { throw new Error('nope'); }) } });
  goTo('Liked recipes');
  await switchTo('es');
  fireEvent.click(await screen.findByRole('button', { name: catalogs.es['common.openLabel'].replace('{title}', 'es:Banana mash') }));
  await shown('Banana mash');
  expect(screen.getByText('Mash it.')).not.toBeNull();
  expect(screen.queryByText(catalogs.es['err.generic'])).toBeNull();
});

test('liking a freshly suggested recipe in Portuguese saves the English recipe', async () => {
  const api = await start();
  addIngredient('banana');
  await switchTo('pt');
  click(catalogs.pt['home.suggest']);
  await shown('pt:Banana mash');
  click(catalogs.pt['recipe.liked']);
  await waitFor(() => expect(api.like).toHaveBeenCalled());
  expect(api.like.mock.calls[0][0]).toMatchObject({ id: 'banana-mash', title: 'Banana mash', steps: ['Mash it.'] });
  expect(api.like.mock.calls[0][0].ingredients[0]).not.toHaveProperty('original');
});

test('switching language on the recipe screen swaps the text', async () => {
  await start({ liked: [first] });
  openFirst();
  await shown('Banana mash');
  await switchTo('de');
  await shown('de:Banana mash');
  await switchTo('en');
  await shown('Banana mash');
  expect(screen.getByText('Mash it.')).not.toBeNull();
});
