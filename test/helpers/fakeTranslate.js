import { vi } from 'vitest';

// A stand-in for the OpenAI translator. Titles and recipe text come back prefixed with the language ("pt:Banana mash");
// typed ingredients come back from the `ingredients` dictionary, or null for a word it does not list.
// `override(task)` replaces the answer whenever it returns something other than undefined.
export function createFakeTranslator({ ingredients = {}, override } = {}) {
  return vi.fn(async (task) => {
    const custom = override?.(task);
    if (custom !== undefined) return custom;
    const tag = (text) => `${task.language}:${text}`;
    if (task.kind === 'titles') return task.titles.map(tag);
    if (task.kind === 'recipe') {
      return { title: tag(task.recipe.title), ingredients: task.recipe.ingredients.map(tag), steps: task.recipe.steps.map(tag) };
    }
    return task.items.map((item) => ingredients[item.toLowerCase()] ?? null);
  });
}
