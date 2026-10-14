import { test, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import RecipeScreen from '../src/client/screens/RecipeScreen.jsx';

afterEach(cleanup);

const recipe = (over = {}) => ({
  id: 'banana-oat-mash',
  title: 'Banana oat mash',
  basePortions: 2,
  ingredients: [
    { name: 'oats', grams: 30, inList: true },
    { name: 'banana', grams: 1000, inList: true },
    { name: 'olive oil', grams: 5, inList: false },
  ],
  steps: ['Mash the banana.', 'Stir in the oats.'],
  texture: 'mashed',
  allergens: [],
  ...over,
});
const more = () => fireEvent.click(screen.getByRole('button', { name: 'More portions' }));
const fewer = () => fireEvent.click(screen.getByRole('button', { name: 'Fewer portions' }));

test('plus doubles amounts and minus restores them', () => {
  render(<RecipeScreen recipe={recipe()} />);
  expect(screen.getByText('30 g')).not.toBeNull();
  more();
  more();
  expect(screen.getByText('60 g')).not.toBeNull();
  expect(screen.getByText('2 kg')).not.toBeNull();
  fewer();
  fewer();
  expect(screen.getByText('30 g')).not.toBeNull();
  expect(screen.getByText('1 kg')).not.toBeNull();
});

test('1.5 kg after one extra portion', () => {
  render(<RecipeScreen recipe={recipe()} />);
  more();
  expect(screen.getByText('1.5 kg')).not.toBeNull();
});

test('limits are 1 and 12 portions', () => {
  render(<RecipeScreen recipe={recipe({ basePortions: 1 })} />);
  expect(screen.getByRole('button', { name: 'Fewer portions' }).disabled).toBe(true);
  for (let i = 0; i < 11; i++) more();
  expect(screen.getByText('12 portions')).not.toBeNull();
  expect(screen.getByRole('button', { name: 'More portions' }).disabled).toBe(true);
});

test('marks ingredients that are not in the list', () => {
  render(<RecipeScreen recipe={recipe()} />);
  expect(screen.getAllByText('not in your list')).toHaveLength(1);
});

test('shows an allergen warning only when there are allergens', () => {
  const { unmount } = render(<RecipeScreen recipe={recipe()} />);
  expect(screen.queryByText(/Allergens:/)).toBeNull();
  unmount();
  render(<RecipeScreen recipe={recipe({ allergens: ['egg'] })} />);
  expect(screen.getByText(/Allergens:.*egg/)).not.toBeNull();
});

test('renders markup in the title as literal text', () => {
  const title = '<img src=x onerror=alert(1)>';
  const { container } = render(<RecipeScreen recipe={recipe({ title })} />);
  expect(screen.getByText(title)).not.toBeNull();
  expect(container.querySelector('img')).toBeNull();
});
