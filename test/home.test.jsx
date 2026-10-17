import { test, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import HomeScreen from '../src/client/screens/HomeScreen.jsx';

afterEach(cleanup);

const home = (ingredients) => (
  <HomeScreen ageText="8 months" ingredients={ingredients} onChange={vi.fn()} onSuggest={() => {}} loading={false} error={null} />
);

test('each ingredient chip shows its emoji next to the name and keeps its Remove button', () => {
  render(home(['carrot', 'dragonfruit']));
  const carrot = screen.getByText('carrot').closest('li');
  expect(carrot.textContent).toContain('🥕');
  expect(screen.getByText('dragonfruit').closest('li').textContent).toContain('🥣');
  expect(screen.getByRole('button', { name: 'Remove carrot' })).not.toBeNull();
});

test('a very long ingredient name is rendered in full and can still be removed', () => {
  const name = 'extra-long-ingredient-name-'.repeat(8);
  const onChange = vi.fn();
  render(<HomeScreen ageText="8 months" ingredients={[name]} onChange={onChange} onSuggest={() => {}} loading={false} error={null} />);
  expect(screen.getByText(name)).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: `Remove ${name}` }));
  expect(onChange).toHaveBeenCalledWith([]);
});
