export const LANGUAGES = ['en', 'pt', 'es', 'de'];
export const LANGUAGE_NAMES = { en: 'English', pt: 'Português', es: 'Español', de: 'Deutsch' };
export const DEFAULT_LANGUAGE = 'en';

export const isLanguage = (value) => LANGUAGES.includes(value);

// Recipes are written in English; these are the languages their text is translated into.
export const TRANSLATED_LANGUAGES = LANGUAGES.filter((l) => l !== DEFAULT_LANGUAGE);
export const isTranslatedLanguage = (value) => TRANSLATED_LANGUAGES.includes(value);
