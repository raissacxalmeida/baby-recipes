import { test, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SharedScreen from '../src/client/screens/SharedScreen.jsx';
import { make } from './helpers/app.jsx';

afterEach(cleanup);

const item = (title, extra = {}) => ({
  id: `s-${title}`, recipe: make(title), group: 'Other', ageMonths: 8, likes: 0, mine: false, liked: false, ...extra,
});
const fish = item('Salmon mash', { group: 'Fish', likes: 1 });
const cake = item('Banana cake', { group: 'Cake', likes: 3, ageMonths: 10 });
const soup = item('Pea soup', { group: 'Soup' });

function renderScreen(props = {}) {
  const handlers = { onGroup: vi.fn(), onOpen: vi.fn(), onToggleLike: vi.fn(), onBack: vi.fn() };
  render(<SharedScreen recipes={[soup, cake, fish]} group="All" {...handlers} {...props} />);
  return handlers;
}
// Chips are the pressed-state buttons without an aria-label (the like buttons carry one).
const chipNames = () => screen.getAllByRole('button')
  .filter((b) => b.hasAttribute('aria-pressed') && !b.hasAttribute('aria-label'))
  .map((b) => b.textContent.replace(/^\P{L}+/u, '').trim());

test('shows All first, then only the groups that have recipes, in the fixed order', () => {
  renderScreen();
  expect(chipNames()).toEqual(['All', 'Fish', 'Cake', 'Soup']);
});

test('choosing a chip reports the group', () => {
  const { onGroup } = renderScreen();
  fireEvent.click(screen.getByRole('button', { name: 'Fish' }));
  expect(onGroup).toHaveBeenCalledWith('Fish');
});

test('the selected group filters the cards and its chip is pressed', () => {
  renderScreen({ group: 'Fish' });
  expect(screen.getByRole('button', { name: 'Fish' }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('false');
  expect(screen.getByRole('button', { name: 'Open Salmon mash' })).not.toBeNull();
  expect(screen.queryByRole('button', { name: 'Open Banana cake' })).toBeNull();
});

test('a selected group with no recipes shows everything, with All pressed', () => {
  renderScreen({ group: 'Meat' });
  expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getAllByRole('button', { name: /^Open / })).toHaveLength(3);
});

test('an empty list shows a note and only the back button', () => {
  renderScreen({ recipes: [] });
  expect(screen.getByRole('note').textContent).toBe('Nothing has been shared yet.');
  expect(screen.getAllByRole('button').map((b) => b.textContent.replace('←', '').trim())).toEqual(['New recipe']);
});

test('a card shows the baby age and a like count with the right wording', () => {
  renderScreen({ group: 'All' });
  expect(screen.getByText('10 mo')).not.toBeNull();
  expect(screen.getByText('3 likes')).not.toBeNull();
  expect(screen.getByText('1 like')).not.toBeNull();
  expect(screen.getByText('0 likes')).not.toBeNull();
});

test('the like button toggles through onToggleLike and shows whether it is on', () => {
  const liked = item('Salmon mash', { group: 'Fish', liked: true });
  const { onToggleLike } = renderScreen({ recipes: [liked, cake] });
  const on = screen.getByRole('button', { name: 'Like Salmon mash' });
  expect(on.getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button', { name: 'Like Banana cake' }).getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(on);
  expect(onToggleLike).toHaveBeenCalledWith(liked);
});

test('your own shared recipe has a badge and no like button', () => {
  renderScreen({ recipes: [item('Banana cake', { group: 'Cake', mine: true, likes: 2 })] });
  expect(screen.getByText('Shared by you')).not.toBeNull();
  expect(screen.getByText('2 likes')).not.toBeNull();
  expect(screen.queryByRole('button', { name: /^Like / })).toBeNull();
});

test('Open and back call their handlers', () => {
  const { onOpen, onBack } = renderScreen();
  fireEvent.click(screen.getByRole('button', { name: 'Open Banana cake' }));
  expect(onOpen).toHaveBeenCalledWith(cake);
  fireEvent.click(screen.getByRole('button', { name: /New recipe/ }));
  expect(onBack).toHaveBeenCalled();
});

test('a very long unbroken title wraps instead of stretching the card', () => {
  const long = 'x'.repeat(120);
  renderScreen({ recipes: [item(long)] });
  expect(screen.getByText(long).className).toContain('wrap-anywhere');
});
