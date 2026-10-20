export const LANGUAGES = ['en', 'pt', 'es', 'de'];
export const LANGUAGE_NAMES = { en: 'English', pt: 'Português', es: 'Español', de: 'Deutsch' };
export const DEFAULT_LANGUAGE = 'en';

export const isLanguage = (value) => LANGUAGES.includes(value);
