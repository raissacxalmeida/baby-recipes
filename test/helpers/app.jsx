import { expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../src/client/App.jsx';
import { createFakeApi } from './fakeApi.js';

export const now = () => new Date(2026, 9, 15);

export const make = (title) => ({
  id: title.toLowerCase().replace(/\s+/g, '-'), title, basePortions: 2,
  ingredients: [{ name: 'banana', grams: 100, inList: true }], steps: ['Mash it.'], texture: 'mashed', allergens: [],
});
export const first = make('Banana mash');
export const second = make('Oat porridge');

export const click = (name) => fireEvent.click(screen.getByRole('button', { name }));
export const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
export const shown = (title) => waitFor(() => expect(screen.getByRole('heading', { name: title })).not.toBeNull());
export const addIngredient = (text) => { type('Ingredient', text); click('Add'); };

// Renders the whole app for a logged-in parent and waits for the first real screen.
export async function startApp({ birthdate = '2026-02-14', user = { email: 'ana@example.com', isAdmin: false }, recipes = [first, second], overrides } = {}) {
  const api = createFakeApi({ user, birthdate, recipes, overrides });
  render(<App api={api} now={now} path="/" navigate={vi.fn()} />);
  await screen.findByRole('button', { name: 'Log out' });
  await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull());
  return api;
}
