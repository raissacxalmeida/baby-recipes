import { test, expect, afterEach } from 'vitest';
import { screen, waitFor, cleanup } from '@testing-library/react';
import { addIngredient, click, make, shown, startApp } from './helpers/app.jsx';

afterEach(cleanup);

const community = [{
  id: 's-pear', recipe: make('Pear mash'), group: 'Fruit', ageMonths: 8, likes: 2, mine: false, liked: false,
}];
const item = (name) => screen.queryByRole('button', { name });
const openMenu = () => click('Menu');
const goTo = (name) => { openMenu(); click(name); };

async function readingARecipe() {
  const api = await startApp({ shared: community });
  addIngredient('banana');
  click('Suggest a recipe');
  await shown('Banana mash');
  return api;
}

test('the menu is closed until the button is pressed', async () => {
  await startApp();
  expect(screen.getByRole('button', { name: 'Menu' }).getAttribute('aria-expanded')).toBe('false');
  expect(item('Log out')).toBeNull();
  openMenu();
  expect(screen.getByRole('button', { name: 'Menu' }).getAttribute('aria-expanded')).toBe('true');
  ['Home', 'Liked recipes', 'Community recipes', 'Log out'].forEach((name) => expect(item(name)).not.toBeNull());
  expect(screen.getByText('ana@example.com')).not.toBeNull();
  expect(item('Admin')).toBeNull();
});

test('the ingredients page no longer has its own Liked and Community buttons', async () => {
  await startApp();
  expect(item('Liked recipes')).toBeNull();
  expect(item('Community recipes')).toBeNull();
});

test('from a recipe the menu goes straight to the community page', async () => {
  await readingARecipe();
  goTo('Community recipes');
  expect(await screen.findByRole('heading', { name: 'Community recipes' })).not.toBeNull();
  expect(screen.getByText('Pear mash')).not.toBeNull();
});

test('from the community page the menu goes straight to the liked page', async () => {
  await startApp({ shared: community });
  goTo('Community recipes');
  await screen.findByRole('heading', { name: 'Community recipes' });
  goTo('Liked recipes');
  expect(await screen.findByRole('heading', { name: 'Liked recipes' })).not.toBeNull();
});

test('picking a page closes the menu', async () => {
  await startApp();
  goTo('Liked recipes');
  await screen.findByRole('heading', { name: 'Liked recipes' });
  expect(item('Log out')).toBeNull();
  expect(screen.getByRole('button', { name: 'Menu' }).getAttribute('aria-expanded')).toBe('false');
});

test('the menu marks the page you are on', async () => {
  await startApp();
  openMenu();
  expect(item('Home').getAttribute('aria-current')).toBe('page');
  expect(item('Liked recipes').getAttribute('aria-current')).toBeNull();
  click('Liked recipes');
  await screen.findByRole('heading', { name: 'Liked recipes' });
  openMenu();
  expect(item('Liked recipes').getAttribute('aria-current')).toBe('page');
  expect(item('Home').getAttribute('aria-current')).toBeNull();
});

test('Home starts a fresh ingredient list', async () => {
  await readingARecipe();
  goTo('Home');
  expect(await screen.findByRole('heading', { name: "What's in the fridge?" })).not.toBeNull();
  expect(screen.queryByText('banana')).toBeNull();
});

test('the recipe page keeps its back button and gains the menu', async () => {
  await readingARecipe();
  expect(screen.getByRole('button', { name: 'New recipe' })).not.toBeNull();
  expect(screen.getByRole('button', { name: 'Menu' })).not.toBeNull();
});

test('before the birthday is set the menu only has the account actions', async () => {
  await startApp({ birthdate: null });
  openMenu();
  expect(item('Log out')).not.toBeNull();
  expect(item('Home')).toBeNull();
  expect(item('Liked recipes')).toBeNull();
  expect(item('Community recipes')).toBeNull();
});

test('the admin page menu has the same page links as the rest of the app', async () => {
  await startApp({ user: { email: 'me@example.com', isAdmin: true } });
  goTo('Admin');
  await screen.findByRole('heading', { name: 'Admin' });
  openMenu();
  ['Home', 'Liked recipes', 'Community recipes', 'Admin', 'Log out'].forEach((name) => expect(item(name)).not.toBeNull());
});

test('from the admin page the menu goes straight to the community page', async () => {
  await startApp({ user: { email: 'me@example.com', isAdmin: true }, shared: community });
  goTo('Admin');
  await screen.findByRole('heading', { name: 'Admin' });
  goTo('Community recipes');
  expect(await screen.findByRole('heading', { name: 'Community recipes' })).not.toBeNull();
  expect(screen.getByText('Pear mash')).not.toBeNull();
  expect(screen.queryByRole('heading', { name: 'Admin' })).toBeNull();
});

test('from the admin page the menu goes straight to the liked page', async () => {
  await startApp({ user: { email: 'me@example.com', isAdmin: true } });
  goTo('Admin');
  await screen.findByRole('heading', { name: 'Admin' });
  goTo('Liked recipes');
  expect(await screen.findByRole('heading', { name: 'Liked recipes' })).not.toBeNull();
});

test('an admin reaches the admin page from the menu and Home brings them back', async () => {
  await startApp({ user: { email: 'me@example.com', isAdmin: true } });
  goTo('Admin');
  expect(await screen.findByRole('heading', { name: 'Admin' })).not.toBeNull();
  openMenu();
  expect(item('Admin').getAttribute('aria-current')).toBe('page');
  click('Home');
  expect(await screen.findByRole('heading', { name: "What's in the fridge?" })).not.toBeNull();
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Admin' })).toBeNull());
});
