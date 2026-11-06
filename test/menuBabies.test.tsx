import { test, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import Menu, { type MenuProps } from '../src/client/components/Menu.jsx';
import type { ApiBaby } from '../src/client/apiTypes.js';

afterEach(cleanup);

const mia: ApiBaby = { id: 'baby-1', name: 'Mia', birthdate: '2026-02-14' };
const leo: ApiBaby = { id: 'baby-2', name: 'Leo', birthdate: '2025-11-01' };
const user = { email: 'ana@example.com', isAdmin: false, language: null };

// Renders the menu already open, with a callback for every page unless the test passes its own.
function openMenu(props: Partial<MenuProps> = {}) {
  const callbacks = {
    onIdeas: vi.fn(), onLiked: vi.fn(), onCommunity: vi.fn(), onAddBaby: vi.fn(), onEditBaby: vi.fn(),
    onAdmin: vi.fn(), onLogout: vi.fn(), onDelete: vi.fn(),
  };
  render(<Menu user={user} babies={[mia, leo]} babyId="baby-1" current="home" {...callbacks} {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
  return callbacks;
}
const group = (name: string) => screen.getByRole('group', { name });
const button = (within_: HTMLElement, name: string) => within(within_).getByRole('button', { name });

test('two babies show a group each, named by the baby, with Recipe ideas and Liked recipes inside', () => {
  openMenu();
  for (const name of ['Mia', 'Leo']) {
    expect(within(group(name)).getByText(name)).not.toBeNull();
    expect(button(group(name), 'Recipe ideas')).not.toBeNull();
    expect(button(group(name), 'Liked recipes')).not.toBeNull();
  }
  expect(screen.getByText('For everyone')).not.toBeNull();
  expect(screen.getByRole('button', { name: 'Community recipes' })).not.toBeNull();
});

test('only the current baby\'s page button on the current page is aria-current', () => {
  openMenu({ current: 'liked', babyId: 'baby-2' });
  const marked = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'page');
  expect(marked).toEqual([button(group('Leo'), 'Liked recipes')]);
  cleanup();
  openMenu({ current: 'shared' });
  expect(screen.getByRole('button', { name: 'Community recipes' }).getAttribute('aria-current')).toBe('page');
  expect(screen.getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'page')).toHaveLength(1);
});

test('a page under another baby calls the callback with that baby\'s id', () => {
  const { onIdeas } = openMenu();
  fireEvent.click(button(group('Leo'), 'Recipe ideas'));
  expect(onIdeas).toHaveBeenCalledWith('baby-2');
  // Picking a page closes the menu.
  expect(screen.queryByRole('group', { name: 'Leo' })).toBeNull();
});

test('Liked recipes under a baby calls onLiked with that baby\'s id', () => {
  const { onLiked } = openMenu();
  fireEvent.click(button(group('Mia'), 'Liked recipes'));
  expect(onLiked).toHaveBeenCalledWith('baby-1');
});

test('Add a baby and Edit Mia call their callbacks; Add a baby is absent without onAddBaby', () => {
  const { onAddBaby, onEditBaby } = openMenu();
  fireEvent.click(button(group('Mia'), 'Edit Mia'));
  expect(onEditBaby).toHaveBeenCalledWith('baby-1');
  fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add a baby' }));
  expect(onAddBaby).toHaveBeenCalled();
  cleanup();
  openMenu({ onAddBaby: undefined });
  expect(screen.queryByRole('button', { name: 'Add a baby' })).toBeNull();
});

test('a baby with no name is called "Your baby"', () => {
  openMenu({ babies: [{ id: 'baby-1', name: null, birthdate: '2026-02-14' }] });
  expect(within(group('Your baby')).getByText('Your baby')).not.toBeNull();
  expect(button(group('Your baby'), 'Edit your baby')).not.toBeNull();
});

test('a 60-character name without spaces renders in full and its element has the wrap-anywhere class', () => {
  const long = 'A'.repeat(60);
  openMenu({ babies: [{ id: 'baby-1', name: long, birthdate: '2026-02-14' }] });
  const name = within(group(long)).getByText(long);
  expect(name.textContent).toBe(long);
  expect(name.classList.contains('wrap-anywhere')).toBe(true);
  expect(name.classList.contains('min-w-0')).toBe(true);
});

test('with no babies the menu has only the account actions and For everyone items', () => {
  openMenu({ babies: [], babyId: null, onAddBaby: undefined, user: { ...user, isAdmin: true }, current: 'admin' });
  expect(screen.queryAllByRole('group').filter((g) => g.getAttribute('aria-label') !== 'For everyone')).toEqual([]);
  expect(screen.queryByRole('button', { name: 'Recipe ideas' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Liked recipes' })).toBeNull();
  expect(screen.getByText('For everyone')).not.toBeNull();
  expect(screen.getByRole('button', { name: 'Community recipes' })).not.toBeNull();
  expect(screen.getByRole('button', { name: 'Admin' }).getAttribute('aria-current')).toBe('page');
  expect(screen.getByRole('button', { name: 'Log out' })).not.toBeNull();
});

test('without page callbacks a baby shows only its header, and For everyone is left out when it has nothing', () => {
  openMenu({ onIdeas: undefined, onLiked: undefined, onCommunity: undefined });
  expect(within(group('Mia')).queryByRole('button', { name: 'Recipe ideas' })).toBeNull();
  expect(screen.queryByText('For everyone')).toBeNull();
});

test('each baby group is named by its visible heading, and the current baby is told to screen readers', () => {
  openMenu();
  const shownName = within(group('Mia')).getByText('Mia');
  expect(group('Mia').getAttribute('aria-labelledby')).toBe(shownName.id);
  expect(group('Mia').hasAttribute('aria-label')).toBe(false);
  const current = within(group('Mia')).getByText('Current baby');
  expect(current.classList.contains('sr-only')).toBe(true);
  expect(within(group('Leo')).queryByText('Current baby')).toBeNull();
});
