import { test, expect } from 'vitest';
import { createFakeApi } from './helpers/fakeApi.js';
import { make } from './helpers/app.jsx';
import type { SharedItem } from '../src/client/apiTypes.js';

const item = (title: string, extra: Partial<SharedItem> = {}): SharedItem => ({
  id: `s-${title}`, recipe: make(title), group: 'Other', ageMonths: 9, likes: 2, mine: false, liked: false, ...extra,
});

// The screen tests lean on the fake behaving like the server, so pin the rules they rely on.
test('liking copies the recipe to the liked list and unliking removes only that copy', async () => {
  const api = createFakeApi({ shared: [item('Pear mash')] });
  await api.likeShared('s-Pear mash');
  expect((await api.listShared())[0]).toMatchObject({ likes: 3, liked: true });
  expect((await api.state()).copiedIds).toEqual(['pear-mash']);
  await api.unlikeShared('s-Pear mash');
  expect((await api.listShared())[0]).toMatchObject({ likes: 2, liked: false });
  expect((await api.state()).liked).toEqual([]);
});

test('an own recipe with the same id is kept when its twin is liked and unliked', async () => {
  const api = createFakeApi({ shared: [item('Pear mash')] });
  await api.like(make('Pear mash'));
  await api.likeShared('s-Pear mash');
  expect((await api.state()).copiedIds).toEqual([]);
  await api.unlikeShared('s-Pear mash');
  expect((await api.state()).liked.map((r) => r.id)).toEqual(['pear-mash']);
});

test('share needs a liked recipe that is not a community copy, and unlike unshares', async () => {
  const api = createFakeApi({ shared: [item('Pear mash')] });
  await expect(api.share('banana-mash')).rejects.toMatchObject({ status: 404 });
  await api.like(make('Banana mash'));
  await api.share('banana-mash');
  expect((await api.state()).sharedIds).toEqual(['banana-mash']);
  await api.likeShared('s-Pear mash');
  await expect(api.share('pear-mash')).rejects.toMatchObject({ status: 409 });
  await api.unlike('banana-mash');
  expect((await api.state()).sharedIds).toEqual([]);
});

const twoBabies = [
  { id: 'a', name: 'Mia', birthdate: '2026-02-14' },
  { id: 'b', name: 'Leo', birthdate: '2026-05-01' },
];

test("a baby's liked list is separate from its sibling's", async () => {
  const api = createFakeApi({ babies: twoBabies });
  await api.withBaby('a').like(make('Banana mash'));
  expect((await api.state()).liked.map((r) => r.id)).toEqual(['banana-mash']);
  expect((await api.withBaby('b').state()).liked).toEqual([]);
  expect((await api.state()).birthdate).toBe('2026-05-01');
  expect((await api.withBaby('a').state()).birthdate).toBe('2026-02-14');
  expect(api.withBaby('a')).toBe(api);
});

test('the Community heart stays on when the other baby is selected, and unliking removes the copy from the baby that holds it', async () => {
  const api = createFakeApi({ babies: twoBabies, shared: [item('Pear mash')] });
  api.withBaby('a');
  await api.likeShared('s-Pear mash');
  expect((await api.state()).liked.map((r) => r.id)).toEqual(['pear-mash']);
  api.withBaby('b');
  expect((await api.listShared())[0]).toMatchObject({ liked: true, likes: 3 });
  expect((await api.state()).liked).toEqual([]);
  await api.unlikeShared('s-Pear mash');
  expect((await api.listShared())[0]).toMatchObject({ liked: false, likes: 2 });
  expect((await api.withBaby('a').state()).liked).toEqual([]);
  expect((await api.state()).copiedIds).toEqual([]);
});

test('a sixth baby is refused and the last baby cannot be removed', async () => {
  const api = createFakeApi({ babies: [{ id: 'a', name: 'Mia', birthdate: '2026-02-14' }] });
  for (const name of ['B', 'C', 'D', 'E']) await api.addBaby({ name, birthdate: '2026-03-01' });
  expect((await api.babies()).babies).toHaveLength(5);
  await expect(api.addBaby({ name: 'F', birthdate: '2026-03-01' })).rejects.toMatchObject({ status: 409 });
  for (const { id } of (await api.babies()).babies.slice(1)) await api.removeBaby(id);
  await expect(api.removeBaby('a')).rejects.toMatchObject({ status: 409 });
  expect((await api.babies()).babies.map((b) => b.id)).toEqual(['a']);
});

test('updateBaby and setLastBaby change the baby and the last one used', async () => {
  const api = createFakeApi({ babies: twoBabies });
  await api.updateBaby('b', { name: 'Leon', birthdate: '2026-06-01' });
  await api.setLastBaby('b');
  expect(await api.babies()).toEqual({
    babies: [twoBabies[0], { id: 'b', name: 'Leon', birthdate: '2026-06-01' }], lastBabyId: 'b',
  });
});
