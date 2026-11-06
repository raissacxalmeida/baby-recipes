import { test, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import App from '../src/client/App.jsx';
import { createFakeApi } from './helpers/fakeApi.js';
import type { ApiBaby } from '../src/client/apiTypes.js';
import { addIngredient, click, first, now, shown, startApp, type } from './helpers/app.jsx';

afterEach(cleanup);

const mia: ApiBaby = { id: 'baby-1', name: 'Mia', birthdate: '2026-02-14' };
const leo: ApiBaby = { id: 'baby-2', name: 'Leo', birthdate: '2025-11-01' };
const openMenu = () => click('Menu');
const markedPage = () => screen.getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'page');
const field = (label: string) => screen.getByLabelText<HTMLInputElement>(label);

test('no baby shows Welcome; saving name and birthday shows Recipe ideas with the age', async () => {
  const api = await startApp({ birthdate: null });
  expect(screen.getByRole('heading', { name: 'Welcome' })).not.toBeNull();
  type("Baby's name", ' Mia ');
  type("Baby's birthday", '2026-02-14');
  click('Save');
  expect(await screen.findByText(/8 months/)).not.toBeNull();
  expect(api.addBaby).toHaveBeenCalledWith({ name: 'Mia', birthdate: '2026-02-14' });
  openMenu();
  expect(markedPage()).toEqual([within(screen.getByRole('group', { name: 'Mia' })).getByRole('button', { name: 'Recipe ideas' })]);
});

test('the first baby screen rejects a future birthday with a message and does not call the server', async () => {
  const api = await startApp({ birthdate: null });
  type("Baby's name", 'Mia');
  type("Baby's birthday", '2027-01-01');
  click('Save');
  expect(screen.getByRole('alert').textContent).toMatch(/birthday/);
  expect(api.addBaby).not.toHaveBeenCalled();
});

test('a server error on save is shown and the form stays', async () => {
  await startApp({ birthdate: null, overrides: { addBaby: vi.fn(async () => { throw new Error('Could not reach the server'); }) } });
  type("Baby's name", 'Mia');
  type("Baby's birthday", '2026-02-14');
  click('Save');
  expect((await screen.findByRole('alert')).textContent).toMatch(/Could not reach/);
  expect(screen.getByRole('heading', { name: 'Welcome' })).not.toBeNull();
  expect(field("Baby's name").value).toBe('Mia');
  expect(field("Baby's birthday").value).toBe('2026-02-14');
});

test('3 months old shows the too-young screen and never asks for a recipe', async () => {
  const api = await startApp({ birthdate: '2026-07-14' });
  expect(screen.getByText(/around 6 months/)).not.toBeNull();
  expect(api.suggest).not.toHaveBeenCalled();
});

test('a baby under 6 months shows the too-young page and Change birthday opens edit mode', async () => {
  const api = await startApp({ birthdate: '2026-07-14' });
  click('Change birthday');
  expect(screen.getByRole('heading', { name: 'Edit baby' })).not.toBeNull();
  expect(field("Baby's name").value).toBe('Mia');
  expect(field("Baby's birthday").value).toBe('2026-07-14');
  click('Cancel');
  expect(await screen.findByText(/around 6 months/)).not.toBeNull();
  click('Change birthday');
  type("Baby's birthday", '2026-02-14');
  click('Save');
  expect(await screen.findByText(/8 months/)).not.toBeNull();
  expect(api.updateBaby).toHaveBeenCalledWith('baby-1', { name: 'Mia', birthdate: '2026-02-14' });
});

test('a baby with no name is asked for it before Recipe ideas', async () => {
  const api = await startApp({ babies: [{ id: 'baby-1', name: null, birthdate: '2026-02-14' }] });
  expect(screen.getByRole('heading', { name: 'Edit baby' })).not.toBeNull();
  expect(field("Baby's name").value).toBe('');
  expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  openMenu();
  expect(screen.getByRole('group', { name: 'Your baby' })).not.toBeNull();
  expect(screen.queryByRole('button', { name: 'Recipe ideas' })).toBeNull();
  openMenu();
  click('Save');
  expect(screen.getByRole('alert').textContent).toBe('Enter a name of 1 to 30 characters');
  type("Baby's name", 'Mia');
  click('Save');
  expect(await screen.findByText(/8 months/)).not.toBeNull();
  expect(api.updateBaby).toHaveBeenCalledWith('baby-1', { name: 'Mia', birthdate: '2026-02-14' });
  openMenu();
  expect(screen.getByRole('group', { name: 'Mia' })).not.toBeNull();
  expect(screen.queryByRole('group', { name: 'Your baby' })).toBeNull();
});

test('a baby with no birthdate is asked for it before Recipe ideas', async () => {
  await startApp({ babies: [{ id: 'baby-1', name: 'Mia', birthdate: null }] });
  expect(screen.getByRole('heading', { name: 'Edit baby' })).not.toBeNull();
  expect(field("Baby's name").value).toBe('Mia');
  type("Baby's birthday", '2026-02-14');
  click('Save');
  expect(await screen.findByText(/8 months/)).not.toBeNull();
});

test('the app opens on the last-used baby, and on the first baby when that one is missing', async () => {
  await startApp({ babies: [mia, leo], lastBabyId: 'baby-2' });
  expect(await screen.findByText(/11 months/)).not.toBeNull();
  openMenu();
  expect(markedPage()).toEqual([within(screen.getByRole('group', { name: 'Leo' })).getByRole('button', { name: 'Recipe ideas' })]);
  cleanup();
  await startApp({ babies: [mia, leo], lastBabyId: 'baby-9' });
  expect(await screen.findByText(/8 months/)).not.toBeNull();
});

test('a failure loading the babies is shown, and the menu still offers Log out', async () => {
  await startApp({ overrides: { babies: vi.fn(async () => { throw new Error('Could not reach the server'); }) } });
  expect(screen.getByRole('alert').textContent).toMatch(/Could not reach/);
  openMenu();
  expect(screen.getByRole('button', { name: 'Log out' })).not.toBeNull();
});

test('a 401 while loading the babies goes back to the login form', async () => {
  const api = createFakeApi({
    user: { email: 'ana@example.com', isAdmin: false }, birthdate: '2026-02-14',
    overrides: { babies: vi.fn(async () => { throw Object.assign(new Error('gone'), { status: 401 }); }) },
  });
  render(<App api={api} now={now} path="/" navigate={vi.fn()} />);
  expect(await screen.findByText('Your session ended. Please log in again.')).not.toBeNull();
});

test('ingredients are normalised, de-duplicated and removable', async () => {
  await startApp();
  addIngredient(' Tomatoes ');
  addIngredient('tomato');
  addIngredient('   ');
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  expect(screen.getByText('tomato')).not.toBeNull();
  click('Remove tomato');
  expect(screen.queryAllByRole('listitem')).toHaveLength(0);
});

test('Suggest is disabled without ingredients', async () => {
  await startApp();
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Suggest a recipe' }).disabled).toBe(true);
});

test('suggesting shows the recipe and sends only the ingredients', async () => {
  const api = await startApp();
  addIngredient('banana');
  click('Suggest a recipe');
  await shown('Banana mash');
  expect(api.suggest).toHaveBeenCalledWith(['banana']);
});

test('a failed request shows the message and keeps the ingredients', async () => {
  await startApp({ overrides: { suggest: vi.fn(async () => { throw new Error('Could not reach the server'); }) } });
  addIngredient('banana');
  click('Suggest a recipe');
  await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Could not reach/));
  expect(screen.getByText('banana')).not.toBeNull();
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Suggest a recipe' }).disabled).toBe(false);
});

test('the not-medical-advice note is shown', async () => {
  await startApp();
  expect(screen.getByText(/not medical advice/i)).not.toBeNull();
});

test('nothing is read from or written to localStorage', async () => {
  const api = await startApp();
  addIngredient('banana');
  click('Suggest a recipe');
  await shown('Banana mash');
  click('Baby liked it');
  await waitFor(() => expect(api.like).toHaveBeenCalledWith(first));
  expect(localStorage.length).toBe(0);
});
