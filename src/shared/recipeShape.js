// Same shape check the browser used for stored recipes; the server now applies it to client input.
export const isRecipe = (r) =>
  r !== null && typeof r === 'object' &&
  typeof r.id === 'string' && typeof r.title === 'string' &&
  Number.isInteger(r.basePortions) && r.basePortions >= 1 && r.basePortions <= 12 &&
  Array.isArray(r.ingredients) && r.ingredients.every((i) => i && typeof i.name === 'string' && typeof i.grams === 'number') &&
  Array.isArray(r.steps) && r.steps.every((s) => typeof s === 'string') &&
  Array.isArray(r.allergens);
