import { test, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Logo from '../src/client/components/Logo.jsx';

afterEach(cleanup);

test('shows the name and no tagline by default', () => {
  render(<Logo />);
  expect(screen.getByText('Tiny Pantry')).not.toBeNull();
  expect(screen.queryByText('recipes for little eaters')).toBeNull();
});

test('shows the tagline when asked', () => {
  render(<Logo size="lg" tagline />);
  expect(screen.getByText('Tiny Pantry')).not.toBeNull();
  expect(screen.getByText('recipes for little eaters')).not.toBeNull();
});

test('is not a heading and hides the mark from screen readers', () => {
  const { container } = render(<Logo size="lg" tagline />);
  expect(screen.queryByRole('heading')).toBeNull();
  expect(container.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
});

test('the mark keeps the sprout and the heart', () => {
  const { container } = render(<Logo />);
  const svg = container.querySelector('svg').outerHTML.toLowerCase();
  expect(svg).toContain('#8db59a');
  expect(svg).toContain('#f6b9a6');
});
