import type { Language, TranslatedLanguage } from './types.js';

export const LANGUAGES = ['en', 'pt', 'es', 'de'] as const;
export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', pt: 'Português', es: 'Español', de: 'Deutsch' };
export const DEFAULT_LANGUAGE = 'en';

// `includes` only accepts a Language, so the list is viewed as unknown values to test any input.
export const isLanguage = (value: unknown): value is Language => (LANGUAGES as readonly unknown[]).includes(value);

// Recipes are written in English; these are the languages their text is translated into.
export const TRANSLATED_LANGUAGES: TranslatedLanguage[] = LANGUAGES.filter((l): l is TranslatedLanguage => l !== DEFAULT_LANGUAGE);
export const isTranslatedLanguage = (value: unknown): value is TranslatedLanguage => (TRANSLATED_LANGUAGES as unknown[]).includes(value);
