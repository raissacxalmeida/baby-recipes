import { test, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, cleanup } from '@testing-library/react';
import { addIngredient, click, first, second, shown, startApp } from './helpers/app.jsx';

afterEach(cleanup);

const suggestFirst = async (options) => {
  const api = await startApp(options);
  addIngredient('banana');
  click('Suggest a recipe');
  await shown('Banana mash');
  return api;
};
const openLiked = () => { click('Back to ingredients'); click('Liked recipes'); };

test('Give me another asks again and shows a different recipe', async () => {
  const api = await suggestFirst();
  click('Give me another');
  await shown('Oat porridge');
  expect(api.suggest).toHaveBeenCalledTimes(2);
});

test("Baby didn't like it stores the dislike and asks for another recipe", async () => {
  const api = await suggestFirst();
  click("Baby didn't like it");
  await shown('Oat porridge');
  expect(api.dislike).toHaveBeenCalledWith(first);
  expect(api.state_.disliked.map((r) => r.title)).toEqual(['Banana mash']);
});

test('liked recipes are listed and open without asking the server for a recipe', async () => {
  const api = await suggestFirst();
  click('Baby liked it');
  await waitFor(() => expect(screen.getByText('Saved to liked recipes.')).not.toBeNull());
  openLiked();
  expect(await screen.findByRole('heading', { name: 'Liked recipes' })).not.toBeNull();
  click('Open Banana mash');
  await shown('Banana mash');
  expect(screen.getByRole('button', { name: 'More portions' })).not.toBeNull();
  expect(screen.queryByRole('button', { name: 'Baby liked it' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Give me another' })).toBeNull();
  expect(api.suggest).toHaveBeenCalledTimes(1);
});

test('Remove takes a recipe out of the liked list', async () => {
  const api = await suggestFirst();
  click('Baby liked it');
  await waitFor(() => expect(api.like).toHaveBeenCalled());
  openLiked();
  click('Remove Banana mash');
  await waitFor(() => expect(screen.queryByText('Banana mash')).toBeNull());
  expect(api.unlike).toHaveBeenCalledWith('banana-mash');
});

test('Restore moves a disliked recipe out of Not liked and lets it be suggested again', async () => {
  const api = await suggestFirst();
  click("Baby didn't like it");
  await shown('Oat porridge');
  openLiked();
  expect(await screen.findByRole('heading', { name: 'Not liked' })).not.toBeNull();
  click('Restore Banana mash');
  await waitFor(() => expect(screen.queryByText('Banana mash')).toBeNull());
  expect(api.restore).toHaveBeenCalledWith('banana-mash');
  expect(api.state_.shown).not.toContain('Banana mash');
});

test('an old error is not shown after navigating elsewhere', async () => {
  await startApp({ overrides: { suggest: vi.fn(async () => { throw new Error('Could not reach the server'); }) } });
  addIngredient('banana');
  click('Suggest a recipe');
  await waitFor(() => expect(screen.getByRole('alert')).not.toBeNull());
  click('Liked recipes');
  click('Back to ingredients');
  expect(screen.queryByRole('alert')).toBeNull();
});

test('a response that arrives after navigating away is ignored', async () => {
  let resolve;
  await startApp({ overrides: { suggest: vi.fn(() => new Promise((r) => { resolve = r; })) } });
  addIngredient('banana');
  click('Suggest a recipe');
  click('Liked recipes');
  resolve(first);
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.getByRole('heading', { name: 'Liked recipes' })).not.toBeNull();
  expect(screen.queryByRole('heading', { name: 'Banana mash' })).toBeNull();
});

test('Baby liked it is disabled while another recipe is loading', async () => {
  let resolve;
  const suggest = vi.fn().mockResolvedValueOnce(first).mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
  await startApp({ overrides: { suggest } });
  addIngredient('banana');
  click('Suggest a recipe');
  await shown('Banana mash');
  click('Give me another');
  expect(screen.getByRole('button', { name: 'Baby liked it' }).disabled).toBe(true);
  resolve(second);
  await shown('Oat porridge');
});

test('a failed Give me another keeps the recipe and shows the message', async () => {
  const suggest = vi.fn().mockResolvedValueOnce(first).mockRejectedValueOnce(new Error('Daily limit reached. It resets at 00:00 UTC'));
  await startApp({ overrides: { suggest } });
  addIngredient('banana');
  click('Suggest a recipe');
  await shown('Banana mash');
  click('Give me another');
  await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Daily limit reached/));
  expect(screen.getByRole('heading', { name: 'Banana mash' })).not.toBeNull();
});
