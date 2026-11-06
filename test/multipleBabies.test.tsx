import { test, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within, waitFor, renderHook, act } from '@testing-library/react';
import App from '../src/client/App.jsx';
import { useBabies } from '../src/client/useBabies.js';
import type { ApiBaby, ApiRecipe, SharedItem } from '../src/client/apiTypes.js';
import { createFakeApi, type FakeApi, type FakeApiOptions } from './helpers/fakeApi.js';
import { addIngredient, click, first, make, now, second, shown, startApp, type } from './helpers/app.jsx';

afterEach(cleanup);

const mia: ApiBaby = { id: 'baby-1', name: 'Mia', birthdate: '2026-02-14' };
const leo: ApiBaby = { id: 'baby-2', name: 'Leo', birthdate: '2025-11-01' };
const field = (label: string) => screen.getByLabelText<HTMLInputElement>(label);
const group = (name: string) => screen.getByRole('group', { name });
const markedPage = () => screen.getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'page');
// Opens the menu and taps a page (or the edit button) inside a baby's group.
const pick = (baby: string, page: string) => {
  click('Menu');
  fireEvent.click(within(group(baby)).getByRole('button', { name: page }));
};
const fridge = () => screen.findByRole('heading', { name: "What's in the fridge?" });

// The fake serves every baby from one selection (the one withBaby picked last); this runs `write` as `babyId`
// and puts the selection back, the way the server would scope a request by its baby header.
function asBaby(api: FakeApi, babyId: string | null, write: () => void) {
  const was = api.state_.selectedBabyId;
  api.state_.selectedBabyId = babyId;
  try { write(); } finally { api.state_.selectedBabyId = was; }
}
const seedLiked = (api: FakeApi, babyId: string, liked: ApiRecipe[]) => asBaby(api, babyId, () => { api.state_.liked = liked; });

// Like startApp, with each baby's liked list in place before the app loads it.
async function startWithLiked(liked: Record<string, ApiRecipe[]>, options: FakeApiOptions) {
  const api = createFakeApi({ user: { email: 'ana@example.com', isAdmin: false }, recipes: [first, second], ...options });
  Object.entries(liked).forEach(([babyId, list]) => seedLiked(api, babyId, list));
  render(<App api={api} now={now} path="/" navigate={vi.fn()} />);
  await screen.findByRole('button', { name: 'Menu' });
  await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull());
  return api;
}

// A promise the test settles by hand.
function deferred<T = void>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}

test('pages show the current baby\'s liked recipes, and a page under the other baby shows theirs', async () => {
  const api = await startWithLiked({ 'baby-1': [first], 'baby-2': [second] }, { babies: [mia, leo] });
  pick('Mia', 'Liked recipes');
  await shown('Liked recipes');
  expect(await screen.findByRole('button', { name: 'Open Banana mash' })).not.toBeNull();
  expect(screen.queryByRole('button', { name: 'Open Oat porridge' })).toBeNull();
  pick('Leo', 'Liked recipes');
  expect(await screen.findByRole('button', { name: 'Open Oat porridge' })).not.toBeNull();
  expect(screen.queryByRole('button', { name: 'Open Banana mash' })).toBeNull();
  expect(api.setLastBaby).toHaveBeenCalledWith('baby-2');
  click('Menu');
  expect(markedPage()).toEqual([within(group('Leo')).getByRole('button', { name: 'Liked recipes' })]);
  click('Menu');
  // Recipe ideas under Leo is Leo's start page: his age, not Mia's.
  pick('Leo', 'Recipe ideas');
  await fridge();
  expect(screen.getByText(/11 months/)).not.toBeNull();
});

test('liking a recipe for one baby does not put it in the other\'s list, and a recipe one baby disliked can be suggested to the other', async () => {
  const api = await startApp({ babies: [mia, leo] });
  addIngredient('banana');
  click('Suggest a recipe');
  await shown('Banana mash');
  click('Baby didn\'t like it');
  await shown('Oat porridge');
  click('Baby liked it');
  await screen.findByText('Saved to liked recipes.');
  pick('Leo', 'Liked recipes');
  expect(await screen.findByText('No liked recipes yet.')).not.toBeNull();
  expect(screen.queryByRole('button', { name: 'Open Oat porridge' })).toBeNull();
  pick('Leo', 'Recipe ideas');
  await fridge();
  addIngredient('banana');
  click('Suggest a recipe');
  await shown('Banana mash');
  pick('Mia', 'Liked recipes');
  expect(await screen.findByRole('button', { name: 'Open Oat porridge' })).not.toBeNull();
  expect(api.suggest).toHaveBeenCalledTimes(3);
});

// The fake cannot prove that a request carries its own baby (test/clientApi.test.ts covers the header); this checks the
// screen: a like that comes back after the switch is written for the baby it was made for and never shows under the new one.
test('switching while a request is in flight does not write to the new baby', async () => {
  const late = deferred();
  let api: FakeApi | null = null;
  const like = vi.fn(async (recipe: ApiRecipe) => {
    const fake = api;
    if (!fake) throw new Error('no api');
    const babyId = fake.state_.selectedBabyId;
    await late.promise;
    asBaby(fake, babyId, () => { fake.state_.liked = [...fake.state_.liked, recipe]; });
    return { ok: true } as const;
  });
  api = await startApp({ babies: [mia, leo], overrides: { like } });
  addIngredient('banana');
  click('Suggest a recipe');
  await shown('Banana mash');
  click('Baby liked it');
  await waitFor(() => expect(like).toHaveBeenCalled());
  pick('Leo', 'Liked recipes');
  expect(await screen.findByText('No liked recipes yet.')).not.toBeNull();
  late.resolve();
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  expect(screen.getByText('No liked recipes yet.')).not.toBeNull();
  expect(screen.queryByRole('button', { name: 'Open Banana mash' })).toBeNull();
  expect(screen.queryByText('Saved to liked recipes.')).toBeNull();
  pick('Mia', 'Liked recipes');
  expect(await screen.findByRole('button', { name: 'Open Banana mash' })).not.toBeNull();
});

test('a dislike that comes back after switching does not ask for another recipe for the new baby', async () => {
  const late = deferred();
  const dislike = vi.fn(async () => { await late.promise; return { ok: true } as const; });
  const api = await startApp({ babies: [mia, leo], overrides: { dislike } });
  addIngredient('banana');
  click('Suggest a recipe');
  await shown('Banana mash');
  click('Baby didn\'t like it');
  await waitFor(() => expect(dislike).toHaveBeenCalled());
  pick('Leo', 'Liked recipes');
  expect(await screen.findByText('No liked recipes yet.')).not.toBeNull();
  late.resolve();
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  expect(api.suggest).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('heading', { name: 'Oat porridge' })).toBeNull();
  expect(screen.getByText('No liked recipes yet.')).not.toBeNull();
});

test('Add a baby opens the add screen, saving lands on the new baby\'s Recipe ideas, and the menu now lists both; Cancel goes back', async () => {
  const api = await startApp({ babies: [mia] });
  click('Menu');
  click('Add a baby');
  await shown('Add a baby');
  expect(field("Baby's name").value).toBe('');
  expect(screen.queryByRole('button', { name: 'Remove this baby' })).toBeNull();
  click('Cancel');
  await fridge();
  expect(screen.getByText(/8 months/)).not.toBeNull();
  click('Menu');
  click('Add a baby');
  await shown('Add a baby');
  type("Baby's name", 'Leo');
  type("Baby's birthday", '2025-11-01');
  click('Save');
  expect(await screen.findByText(/11 months/)).not.toBeNull();
  await fridge();
  expect(api.addBaby).toHaveBeenCalledWith({ name: 'Leo', birthdate: '2025-11-01' });
  click('Menu');
  expect(group('Mia')).not.toBeNull();
  expect(markedPage()).toEqual([within(group('Leo')).getByRole('button', { name: 'Recipe ideas' })]);
});

test('Cancel on the add screen goes back to the page it was opened from', async () => {
  await startApp({ babies: [mia] });
  pick('Mia', 'Liked recipes');
  await shown('Liked recipes');
  click('Menu');
  click('Add a baby');
  await shown('Add a baby');
  click('Cancel');
  await shown('Liked recipes');
});

test('at five babies Add a baby is not in the menu', async () => {
  const four = [1, 2, 3, 4].map((n): ApiBaby => ({ id: `baby-${n}`, name: `Baby ${n}`, birthdate: '2026-02-14' }));
  await startApp({ babies: four });
  click('Menu');
  expect(screen.getByRole('button', { name: 'Add a baby' })).not.toBeNull();
  cleanup();
  await startApp({ babies: [...four, { id: 'baby-5', name: 'Baby 5', birthdate: '2026-02-14' }] });
  click('Menu');
  expect(screen.getAllByRole('group')).toHaveLength(6);
  expect(screen.queryByRole('button', { name: 'Add a baby' })).toBeNull();
});

test('Edit opens the baby\'s details prefilled, saving updates the name in the menu and the age on Recipe ideas', async () => {
  const api = await startApp({ babies: [mia, leo] });
  pick('Leo', 'Edit Leo');
  await shown('Edit baby');
  expect(field("Baby's name").value).toBe('Leo');
  expect(field("Baby's birthday").value).toBe('2025-11-01');
  expect(api.setLastBaby).toHaveBeenCalledWith('baby-2');
  type("Baby's name", 'Leon');
  type("Baby's birthday", '2026-01-15');
  click('Save');
  expect(await screen.findByText(/9 months/)).not.toBeNull();
  expect(api.updateBaby).toHaveBeenCalledWith('baby-2', { name: 'Leon', birthdate: '2026-01-15' });
  click('Menu');
  expect(screen.queryByRole('group', { name: 'Leo' })).toBeNull();
  expect(markedPage()).toEqual([within(group('Leon')).getByRole('button', { name: 'Recipe ideas' })]);
  // The baby showing is edited in place, and Cancel goes back to their start page.
  fireEvent.click(within(group('Leon')).getByRole('button', { name: 'Edit Leon' }));
  await shown('Edit baby');
  expect(field("Baby's name").value).toBe('Leon');
  click('Cancel');
  expect(await screen.findByText(/9 months/)).not.toBeNull();
});

test('Remove asks to confirm, removes the baby and lands on the remaining baby; the only baby has no Remove button', async () => {
  const api = await startApp({ babies: [mia, leo] });
  pick('Mia', 'Edit Mia');
  await shown('Edit baby');
  click('Remove this baby');
  const dialog = await screen.findByRole('alertdialog');
  expect(within(dialog).getByText(/Remove Mia/)).not.toBeNull();
  expect(api.removeBaby).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, remove' }));
  expect(await screen.findByText(/11 months/)).not.toBeNull();
  await fridge();
  expect(api.removeBaby).toHaveBeenCalledWith('baby-1');
  click('Menu');
  expect(screen.queryByRole('group', { name: 'Mia' })).toBeNull();
  expect(markedPage()).toEqual([within(group('Leo')).getByRole('button', { name: 'Recipe ideas' })]);
  fireEvent.click(within(group('Leo')).getByRole('button', { name: 'Edit Leo' }));
  await shown('Edit baby');
  expect(screen.queryByRole('button', { name: 'Remove this baby' })).toBeNull();
});

test('a failed Remove is shown on the edit screen and the baby stays', async () => {
  await startApp({
    babies: [mia, leo], overrides: { removeBaby: vi.fn(async () => { throw new Error('Could not reach the server'); }) },
  });
  pick('Mia', 'Edit Mia');
  await shown('Edit baby');
  click('Remove this baby');
  fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Yes, remove' }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/Could not reach/);
  expect(screen.getByRole('heading', { name: 'Edit baby' })).not.toBeNull();
  click('Menu');
  expect(group('Mia')).not.toBeNull();
});

test('the Community heart set from one baby shows as liked from the other', async () => {
  const shared: SharedItem[] = [{
    id: 's-pear', recipe: make('Pear mash'), group: 'Fruit', ageMonths: 8, likes: 2, mine: false, liked: false,
  }];
  await startApp({ babies: [mia, leo], shared });
  click('Menu');
  click('Community recipes');
  await shown('Community recipes');
  click('Like Pear mash');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Like Pear mash' }).getAttribute('aria-pressed')).toBe('true'));
  pick('Leo', 'Recipe ideas');
  await fridge();
  click('Menu');
  click('Community recipes');
  await shown('Community recipes');
  expect(screen.getByRole('button', { name: 'Like Pear mash' }).getAttribute('aria-pressed')).toBe('true');
});

test('from the admin page, Liked recipes under a baby opens that baby\'s liked page', async () => {
  await startWithLiked({ 'baby-2': [second] }, { user: { email: 'admin@example.com', isAdmin: true }, babies: [mia, leo] });
  click('Menu');
  click('Admin');
  await shown('Admin');
  click('Menu');
  expect(within(group('Mia')).getByRole('button', { name: 'Recipe ideas' })).not.toBeNull();
  click('Menu');
  pick('Leo', 'Liked recipes');
  await shown('Liked recipes');
  expect(await screen.findByRole('button', { name: 'Open Oat porridge' })).not.toBeNull();
  click('Menu');
  expect(markedPage()).toEqual([within(group('Leo')).getByRole('button', { name: 'Liked recipes' })]);
});

test('from the admin page, Edit and Add a baby open the baby screens', async () => {
  await startApp({ user: { email: 'admin@example.com', isAdmin: true }, babies: [mia, leo] });
  click('Menu');
  click('Admin');
  await shown('Admin');
  pick('Leo', 'Edit Leo');
  await shown('Edit baby');
  expect(field("Baby's name").value).toBe('Leo');
  click('Menu');
  click('Admin');
  await shown('Admin');
  click('Menu');
  click('Add a baby');
  await shown('Add a baby');
  click('Cancel');
  await fridge();
});

// A page asked for on the admin page is used once: adding the first baby afterwards lands on their Recipe ideas.
test('an admin with no baby who picks Community on the admin page, then adds the first baby, lands on Recipe ideas', async () => {
  await startApp({ user: { email: 'admin@example.com', isAdmin: true }, birthdate: null });
  click('Menu');
  click('Admin');
  await shown('Admin');
  click('Menu');
  click('Community recipes');
  await shown('Welcome');
  type("Baby's name", 'Mia');
  type("Baby's birthday", '2026-02-14');
  click('Save');
  expect(await screen.findByText(/8 months/)).not.toBeNull();
  await fridge();
  expect(screen.queryByRole('heading', { name: 'Community recipes' })).toBeNull();
});

test('a page picked on the admin page is used once: the next baby switch opens Recipe ideas', async () => {
  await startApp({ user: { email: 'admin@example.com', isAdmin: true }, babies: [mia, leo] });
  click('Menu');
  click('Admin');
  await shown('Admin');
  pick('Mia', 'Liked recipes');
  await shown('Liked recipes');
  click('Menu');
  click('Add a baby');
  type("Baby's name", 'Ana');
  type("Baby's birthday", '2026-01-15');
  click('Save');
  expect(await screen.findByText(/9 months/)).not.toBeNull();
  await fridge();
});

test('a baby named with 60 characters and no spaces does not break the menu', async () => {
  const long = 'A'.repeat(60);
  await startApp({ babies: [{ id: 'baby-1', name: long, birthdate: '2026-02-14' }, leo] });
  click('Menu');
  const named = within(group(long));
  expect(named.getByText(long).classList.contains('wrap-anywhere')).toBe(true);
  expect(named.getByRole('button', { name: `Edit ${long}` })).not.toBeNull();
  expect(named.getByRole('button', { name: 'Recipe ideas' }).getAttribute('aria-current')).toBe('page');
  click('Menu');
  pick('Leo', 'Recipe ideas');
  expect(await screen.findByText(/11 months/)).not.toBeNull();
  pick(long, 'Liked recipes');
  await shown('Liked recipes');
});

test('a too-young baby\'s menu still reaches the other baby\'s pages', async () => {
  const tiny: ApiBaby = { id: 'baby-2', name: 'Bia', birthdate: '2026-07-14' };
  await startApp({ babies: [mia, tiny], lastBabyId: 'baby-2' });
  expect(screen.getByText(/around 6 months/)).not.toBeNull();
  pick('Mia', 'Recipe ideas');
  expect(await screen.findByText(/8 months/)).not.toBeNull();
  // Recipe ideas for a too-young baby is their too-young page, never the ingredient form.
  pick('Bia', 'Recipe ideas');
  expect(await screen.findByText(/around 6 months/)).not.toBeNull();
  pick('Bia', 'Liked recipes');
  await shown('Liked recipes');
  pick('Bia', 'Recipe ideas');
  expect(await screen.findByText(/around 6 months/)).not.toBeNull();
  expect(screen.queryByRole('heading', { name: "What's in the fridge?" })).toBeNull();
});

// useBabies on its own: the list and the remembered baby under quick, overlapping calls.

const signedIn = { email: 'ana@example.com', isAdmin: false };

async function hook(api: FakeApi) {
  const view = renderHook(() => useBabies(api, true));
  await waitFor(() => expect(view.result.current.status).toBe('ready'));
  return view;
}

test('an add and a remove that overlap keep the added baby', async () => {
  const api = createFakeApi({ user: signedIn, babies: [mia, leo] });
  const { result } = await hook(api);
  const { add, remove } = result.current;
  await act(async () => {
    await Promise.all([add({ name: 'Ana', birthdate: '2026-01-15' }), remove('baby-1')]);
  });
  expect(result.current.babies.map((b) => b.name)).toEqual(['Leo', 'Ana']);
});

test('removing a baby selects a remaining one, and quick picks remember only the last baby on the server', async () => {
  const replies: Array<() => void> = [];
  const babies = [mia, leo, { id: 'baby-3', name: 'Ana', birthdate: '2026-01-15' }];
  const api = createFakeApi({ user: signedIn, babies });
  const setLastBaby = api.setLastBaby.getMockImplementation();
  if (!setLastBaby) throw new Error('no setLastBaby');
  api.setLastBaby.mockImplementation((babyId) => new Promise((resolve, reject) => {
    replies.push(() => { setLastBaby(babyId).then(resolve, reject); });
  }));
  const { result } = await hook(api);
  act(() => result.current.select('baby-2'));
  act(() => result.current.select('baby-3'));
  act(() => result.current.select('baby-1'));
  expect(result.current.babyId).toBe('baby-1');
  // One request at a time: the second waits for the first, and the picks in between are skipped.
  expect(api.setLastBaby.mock.calls).toEqual([['baby-2']]);
  await act(async () => { replies.shift()?.(); });
  await waitFor(() => expect(api.setLastBaby.mock.calls).toEqual([['baby-2'], ['baby-1']]));
  await act(async () => { replies.shift()?.(); });
  await waitFor(() => expect(api.state_.lastBabyId).toBe('baby-1'));
});

test('a failed remember does not stop the next one', async () => {
  const api = createFakeApi({ user: signedIn, babies: [mia, leo] });
  api.setLastBaby.mockRejectedValueOnce(new Error('Could not reach the server'));
  const { result } = await hook(api);
  await act(async () => { result.current.select('baby-2'); });
  await act(async () => { result.current.select('baby-1'); });
  await waitFor(() => expect(api.state_.lastBabyId).toBe('baby-1'));
  expect(api.setLastBaby).toHaveBeenCalledTimes(2);
});

test('the whole app reopens on the baby picked last', async () => {
  const api = await startApp({ babies: [mia, leo] });
  pick('Leo', 'Recipe ideas');
  expect(await screen.findByText(/11 months/)).not.toBeNull();
  await waitFor(() => expect(api.state_.lastBabyId).toBe('baby-2'));
  cleanup();
  render(<App api={api} now={now} path="/" navigate={vi.fn()} />);
  expect(await screen.findByText(/11 months/)).not.toBeNull();
});
