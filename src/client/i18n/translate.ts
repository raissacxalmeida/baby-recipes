import type { Language } from '../../shared/types.js';
import type { CatalogEntry } from './en.js';

// The values a {slot} in a text is filled with.
export type TranslateParams = Record<string, unknown>;

// Portuguese counts zero with the singular in CLDR ("0 curtida"); people write "0 curtidas".
const pluralForm = (language: Language, count: number): Intl.LDMLPluralRule =>
  language === 'pt' && count === 0 ? 'other' : new Intl.PluralRules(language).select(count);

// Pure lookup: no globals, so it is easy to test. Entries are strings or { one, other } plurals using {count}.
const own = <K extends string>(catalog: Partial<Record<K, CatalogEntry>> | undefined, key: K): CatalogEntry | undefined =>
  catalog && Object.hasOwn(catalog, key) ? catalog[key] : undefined;

export function createTranslator<K extends string>(
  catalogs: Partial<Record<Language, Partial<Record<K, CatalogEntry>>>>,
  fallback: Language = 'en',
) {
  return (language: Language, key: K, params: TranslateParams = {}): string => {
    const entry = own(catalogs[language], key) ?? own(catalogs[fallback], key);
    if (entry === undefined) return key;
    // Intl may name forms the catalog has no text for (few, many ...); those fall back to `other`.
    const forms: Partial<Record<string, string>> = typeof entry === 'string' ? {} : entry;
    const text = typeof entry === 'string' ? entry : forms[pluralForm(language, Number(params.count))] ?? entry.other;
    return text.replace(/\{(\w+)\}/g, (slot, name: string) => (name in params ? String(params[name]) : slot));
  };
}
