import { test, expect, afterEach } from 'vitest';
import { screen, waitFor, cleanup, within } from '@testing-library/react';
import { addIngredient, click, goTo, make, shown, startApp } from './helpers/app.jsx';

afterEach(cleanup);

const item = (title, extra = {}) => ({
  id: `s-${title}`, recipe: make(title), group: 'Other', ageMonths: 8, likes: 0, mine: false, liked: false, ...extra,
});
const pear = item('Pear mash', { group: 'Fruit', likes: 2 });
const cake = item('Banana cake', { group: 'Cake', likes: 5, ageMonths: 11 });

// Suggest the first recipe, like it, and land on the Liked page.
async function startWithLikedBanana(options) {
  const api = await startApp(options);
  addIngredient('banana');
  click('Suggest a recipe');
  await shown('Banana mash');
  click('Baby liked it');
  await waitFor(() => expect(screen.getByText('Saved to liked recipes.')).not.toBeNull());
  goTo('Liked recipes');
  await screen.findByRole('heading', { name: 'Liked recipes' });
  return api;
}
const openCommunity = async () => {
  goTo('Community recipes');
  await screen.findByRole('heading', { name: 'Community recipes' });
};

test('Share on a liked recipe becomes Unshare, and Unshare turns it back', async () => {
  const api = await startWithLikedBanana();
  click('Share Banana mash');
  await screen.findByRole('button', { name: 'Unshare Banana mash' });
  expect(api.share).toHaveBeenCalledWith('banana-mash');
  expect(screen.queryByRole('button', { name: 'Share Banana mash' })).toBeNull();
  click('Unshare Banana mash');
  await screen.findByRole('button', { name: 'Share Banana mash' });
  expect(api.unshare).toHaveBeenCalledWith('banana-mash');
});

test('a share the server refuses shows its message and keeps the button', async () => {
  const api = await startWithLikedBanana();
  api.share.mockRejectedValueOnce(new Error('Something broke'));
  click('Share Banana mash');
  await waitFor(() => expect(screen.getByText('Something broke')).not.toBeNull());
  expect(screen.getByRole('button', { name: 'Share Banana mash' })).not.toBeNull();
});

test('Home opens the community page with cards, and chips filter them', async () => {
  await startApp({ shared: [pear, cake] });
  await openCommunity();
  expect(screen.getByRole('button', { name: 'Open Pear mash' })).not.toBeNull();
  expect(screen.getByRole('button', { name: 'Open Banana cake' })).not.toBeNull();
  click('Cake');
  expect(screen.queryByRole('button', { name: 'Open Pear mash' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Open Banana cake' })).not.toBeNull();
});

test('liking a community recipe saves it to Liked, and liking again removes it', async () => {
  const api = await startApp({ shared: [pear] });
  await openCommunity();
  expect(screen.getByText('2 likes')).not.toBeNull();
  click('Like Pear mash');
  await screen.findByText('3 likes');
  expect(api.likeShared).toHaveBeenCalledWith('s-Pear mash');
  expect(screen.getByRole('button', { name: 'Like Pear mash' }).getAttribute('aria-pressed')).toBe('true');
  goTo('Liked recipes');
  await screen.findByRole('button', { name: 'Open Pear mash' });
  expect(screen.queryByRole('button', { name: 'Share Pear mash' })).toBeNull();
  await openCommunity();
  click('Like Pear mash');
  await screen.findByText('2 likes');
  expect(api.unlikeShared).toHaveBeenCalledWith('s-Pear mash');
  goTo('Liked recipes');
  await screen.findByRole('heading', { name: 'Liked recipes' });
  expect(screen.queryByRole('button', { name: 'Open Pear mash' })).toBeNull();
});

test('opening a community recipe shows it without feedback buttons, and back keeps the chip', async () => {
  await startApp({ shared: [pear, cake] });
  await openCommunity();
  click('Cake');
  click('Open Banana cake');
  await shown('Banana cake');
  expect(screen.getByRole('button', { name: 'More portions' })).not.toBeNull();
  expect(screen.queryByRole('button', { name: 'Baby liked it' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Give me another' })).toBeNull();
  click('Back to community recipes');
  await screen.findByRole('heading', { name: 'Community recipes' });
  expect(screen.getByRole('button', { name: 'Cake' }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.queryByRole('button', { name: 'Open Pear mash' })).toBeNull();
});

test('your own shared recipe shows on the community page with a badge', async () => {
  await startWithLikedBanana();
  click('Share Banana mash');
  await screen.findByRole('button', { name: 'Unshare Banana mash' });
  await openCommunity();
  const card = screen.getByRole('button', { name: 'Open Banana mash' }).closest('li');
  expect(within(card).getByText('Shared by you')).not.toBeNull();
  expect(within(card).queryByRole('button', { name: /^Like / })).toBeNull();
});

test('an empty community page says so', async () => {
  await startApp();
  await openCommunity();
  expect(screen.getByText('Nothing has been shared yet.')).not.toBeNull();
});
