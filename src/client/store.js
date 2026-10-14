import { ageInMonths } from '../shared/age.js';

const PREFIX = 'baby-recipes:';

export function createStore(storage) {
  const read = (key) => {
    try {
      return storage.getItem(PREFIX + key);
    } catch {
      return null;
    }
  };
  const write = (key, value) => {
    try {
      storage.setItem(PREFIX + key, value);
    } catch {
      // Storage unavailable (private mode or full): the app keeps working without saving.
    }
  };
  const readList = (key) => {
    try {
      const parsed = JSON.parse(read(key));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  const writeList = (key, list) => write(key, JSON.stringify(list));
  const without = (list, id) => list.filter((r) => r.id !== id);

  return {
    getBirthdate: () => read('birthdate'),
    setBirthdate: (d) => write('birthdate', d),
    getLiked: () => readList('liked'),
    getDisliked: () => readList('disliked'),
    like(recipe) {
      writeList('liked', [...without(readList('liked'), recipe.id), recipe]);
      writeList('disliked', without(readList('disliked'), recipe.id));
    },
    unlike: (id) => writeList('liked', without(readList('liked'), id)),
    dislike(recipe) {
      writeList('disliked', [...without(readList('disliked'), recipe.id), recipe]);
      writeList('liked', without(readList('liked'), recipe.id));
    },
    restore: (id) => writeList('disliked', without(readList('disliked'), id)),
    getShownTitles: () => readList('shown').filter((t) => typeof t === 'string'),
    addShown(title) {
      const shown = readList('shown');
      if (!shown.includes(title)) writeList('shown', [...shown, title]);
    },
    excludeTitles() {
      const shown = readList('shown').filter((t) => typeof t === 'string');
      return [...new Set([...shown, ...readList('disliked').map((r) => r.title)])];
    },
  };
}

export function startScreen(store, now) {
  const birthdate = store.getBirthdate();
  if (!birthdate) return 'setup';
  try {
    return ageInMonths(birthdate, now) < 6 ? 'too-young' : 'home';
  } catch {
    return 'setup';
  }
}
