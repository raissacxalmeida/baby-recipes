import { test, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, cleanup } from '@testing-library/react';
import { addIngredient, click, shown, startApp } from './helpers/app.jsx';

afterEach(cleanup);

test('Home shows how many recipes were used today', async () => {
  const api = await startApp();
  expect(screen.getByText('Recipes today: 0 of 10')).not.toBeNull();
  addIngredient('banana');
  click('Suggest a recipe');
  await shown('Banana mash');
  click('Back to ingredients');
  await waitFor(() => expect(screen.getByText('Recipes today: 1 of 10')).not.toBeNull());
  expect(api.state).toHaveBeenCalledTimes(2);
});

test('the figure is hidden for the admin', async () => {
  await startApp({ user: { email: 'me@example.com', isAdmin: true } });
  expect(screen.queryByText(/Recipes today/)).toBeNull();
});

test('a limit-reached message is shown and the chips stay', async () => {
  await startApp({ overrides: { suggest: vi.fn(async () => { throw Object.assign(new Error('Daily limit reached. It resets at 00:00 UTC'), { code: 'limit-reached' }); }) } });
  addIngredient('banana');
  click('Suggest a recipe');
  expect((await screen.findByRole('alert')).textContent).toMatch(/resets at 00:00 UTC/);
  expect(screen.getByText('banana')).not.toBeNull();
});
