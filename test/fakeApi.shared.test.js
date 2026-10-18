import { test, expect } from 'vitest';
import { createFakeApi } from './helpers/fakeApi.js';
import { make } from './helpers/app.jsx';

const item = (title, extra = {}) => ({
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
