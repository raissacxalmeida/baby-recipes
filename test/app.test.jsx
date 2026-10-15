import { test, expect, afterEach, vi } from 'vitest';
import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { addIngredient, click, first, shown, startApp, type } from './helpers/app.jsx';

afterEach(cleanup);

test('no birthdate shows setup; saving 8 months ago shows the age on Home', async () => {
  const api = await startApp({ birthdate: null });
  type("Baby's birthday", '2026-02-14');
  click('Continue');
  expect(await screen.findByText(/8 months/)).not.toBeNull();
  expect(api.setBirthdate).toHaveBeenCalledWith('2026-02-14');
});

test('setup rejects a future birthday with a message and does not call the server', async () => {
  const api = await startApp({ birthdate: null });
  type("Baby's birthday", '2027-01-01');
  click('Continue');
  expect(screen.getByRole('alert').textContent).toMatch(/birthday/);
  expect(api.setBirthdate).not.toHaveBeenCalled();
});

test('a server error while saving the birthday is shown', async () => {
  await startApp({ birthdate: null, overrides: { setBirthdate: vi.fn(async () => { throw new Error('Could not reach the server'); }) } });
  type("Baby's birthday", '2026-02-14');
  click('Continue');
  expect((await screen.findByRole('alert')).textContent).toMatch(/Could not reach/);
});

test('3 months old shows the too-young screen and never asks for a recipe', async () => {
  const api = await startApp({ birthdate: '2026-07-14' });
  expect(screen.getByText(/around 6 months/)).not.toBeNull();
  expect(api.suggest).not.toHaveBeenCalled();
});

test('Change birthday from the too-young screen goes back to setup', async () => {
  await startApp({ birthdate: '2026-07-14' });
  click('Change birthday');
  expect(screen.getByLabelText("Baby's birthday")).not.toBeNull();
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
  expect(screen.getByRole('button', { name: 'Suggest a recipe' }).disabled).toBe(true);
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
  expect(screen.getByRole('button', { name: 'Suggest a recipe' }).disabled).toBe(false);
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
