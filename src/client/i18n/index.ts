import { useSyncExternalStore } from 'react';
import { DEFAULT_LANGUAGE, isLanguage } from '../../shared/languages.js';
import type { Language } from '../../shared/types.js';
import catalogs from './catalogs.js';
import type { CatalogKey } from './en.js';
import { createTranslator, type TranslateParams } from './translate.js';

const STORAGE_KEY = 'language';
const translate = createTranslator<CatalogKey>(catalogs);

// A stored choice wins; otherwise the first browser language (its part before the dash) that we offer.
export function detectLanguage({ stored = null, languages = [] }: { stored?: string | null; languages?: readonly unknown[] } = {}): Language {
  if (isLanguage(stored)) return stored;
  const match = languages.map((l) => String(l).toLowerCase().split('-')[0]).find(isLanguage);
  return match ?? DEFAULT_LANGUAGE;
}

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();
let current: Language = detectLanguage({ stored: readStored(), languages: globalThis.navigator?.languages ?? [] });
if (typeof document !== 'undefined') document.documentElement.lang = current;

export const getLanguage = (): Language => current;

export function setLanguage(language: unknown): void {
  if (!isLanguage(language)) return;
  current = language;
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch { /* the choice just is not remembered in this browser */ }
  if (typeof document !== 'undefined') document.documentElement.lang = language;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Only App calls this: its re-render carries every screen below it, since they all call t() while rendering.
export const useLanguage = () => useSyncExternalStore(subscribe, getLanguage);

export const t = (key: CatalogKey, params?: TranslateParams): string => translate(current, key, params);
export const hasKey = (key: string): key is CatalogKey => Object.hasOwn(catalogs.en, key);

// What to show for an error kept in state: the text for its key in the language showing now, else its own message.
// Errors are kept as data (not as finished text) so a language switch changes the wording of one already on screen.
export function errorText(error: string | { message: string; key?: string; params?: TranslateParams }): string {
  if (typeof error === 'string') return error;
  return error.key && hasKey(error.key) ? t(error.key, error.params) : error.message;
}
