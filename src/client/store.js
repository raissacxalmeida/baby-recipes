import { ageInMonths } from '../shared/age.js';

const PREFIX = 'baby-recipes:';

const isRecipe = (r) =>
  r !== null && typeof r === 'object' &&
  typeof r.id === 'string' && typeof r.title === 'string' &&
  Number.isInteger(r.basePortions) && r.basePortions >= 1 && r.basePortions <= 12 &&
  Array.isArray(r.ingredients) && r.ingredients.every((i) => i && typeof i.name === 'string' && typeof i.grams === 'number') &&
  Array.isArray(r.steps) && r.steps.every((s) => typeof s === 'string') &&
  Array.isArray(r.allergens);

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
      if (!Array.isArray(parsed)) return [];
      return key === 'shown' ? parsed.filter((t) => typeof t === 'string') : parsed.filter(isRecipe);
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
    restore(id) {
      const restored = readList('disliked').find((r) => r.id === id);
      writeList('disliked', without(readList('disliked'), id));
      if (restored) writeList('shown', readList('shown').filter((t) => t !== restored.title));
    },
    getShownTitles: () => readList('shown'),
    addShown(title) {
      const shown = readList('shown');
      if (!shown.includes(title)) writeList('shown', [...shown, title]);
    },
    excludeTitles() {
      const shown = readList('shown');
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
