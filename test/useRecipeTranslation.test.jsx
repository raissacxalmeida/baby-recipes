import { test, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useRecipeTranslation } from '../src/client/useRecipeTranslation.js';

const recipe = {
  id: 'banana-mash', title: 'Banana mash', basePortions: 2, texture: 'mashed', allergens: [],
  ingredients: [{ name: 'banana', grams: 100, inList: true }], steps: ['Mash the banana.'],
};
const tagged = (language) => ({ title: `${language}:Banana mash`, ingredients: [`${language}:banana`], steps: [`${language}:Mash the banana.`] });
const apiWith = (translateRecipe) => ({ translateRecipe: vi.fn(translateRecipe) });
const use = (api, props) => renderHook((p) => useRecipeTranslation(api, recipe, p.language, p.enabled ?? true), { initialProps: props });

test('English is idle and asks for nothing', () => {
  const api = apiWith(async () => tagged('pt'));
  const { result } = use(api, { language: 'en' });
  expect(result.current).toEqual({ status: 'idle', recipe });
  expect(api.translateRecipe).not.toHaveBeenCalled();
});

test('it is idle when not enabled', () => {
  const api = apiWith(async () => tagged('pt'));
  const { result } = use(api, { language: 'pt', enabled: false });
  expect(result.current.status).toBe('idle');
  expect(api.translateRecipe).not.toHaveBeenCalled();
});

test('another language is pending, then ready with the translated recipe', async () => {
  const api = apiWith(async (language) => tagged(language));
  const { result } = use(api, { language: 'pt' });
  expect(result.current.status).toBe('pending');
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.recipe.steps).toEqual(['pt:Mash the banana.']);
  expect(result.current.recipe.title).toBe('pt:Banana mash');
  expect(api.translateRecipe).toHaveBeenCalledWith('pt', recipe);
});

test('a failed translation leaves the English recipe', async () => {
  const api = apiWith(async () => { throw new Error('nope'); });
  const { result } = use(api, { language: 'pt' });
  await waitFor(() => expect(result.current.status).toBe('failed'));
  expect(result.current.recipe).toBe(recipe);
});

test('an answer for a language that is no longer showing is ignored', async () => {
  const waiting = {};
  const api = apiWith((language) => new Promise((resolve) => { waiting[language] = resolve; }));
  const { result, rerender } = use(api, { language: 'pt' });
  rerender({ language: 'de' });
  await act(async () => { waiting.pt(tagged('pt')); });
  expect(result.current.status).toBe('pending');
  await act(async () => { waiting.de(tagged('de')); });
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.recipe.steps).toEqual(['de:Mash the banana.']);
});

test('the same recipe in the same language is asked for once', async () => {
  const api = apiWith(async (language) => tagged(language));
  const { result, rerender } = use(api, { language: 'pt' });
  await waitFor(() => expect(result.current.status).toBe('ready'));
  rerender({ language: 'pt', enabled: false });
  rerender({ language: 'pt', enabled: true });
  expect(result.current.status).toBe('ready');
  expect(api.translateRecipe).toHaveBeenCalledTimes(1);
});
