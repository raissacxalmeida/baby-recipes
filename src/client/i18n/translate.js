// Portuguese counts zero with the singular in CLDR ("0 curtida"); people write "0 curtidas".
const pluralForm = (language, count) =>
  language === 'pt' && count === 0 ? 'other' : new Intl.PluralRules(language).select(count);

// Pure lookup: no globals, so it is easy to test. Entries are strings or { one, other } plurals using {count}.
const own = (catalog, key) => (catalog && Object.hasOwn(catalog, key) ? catalog[key] : undefined);

export function createTranslator(catalogs, fallback = 'en') {
  return (language, key, params = {}) => {
    const entry = own(catalogs[language], key) ?? own(catalogs[fallback], key);
    if (entry === undefined) return key;
    const text = typeof entry === 'string' ? entry : entry[pluralForm(language, Number(params.count))] ?? entry.other;
    return text.replace(/\{(\w+)\}/g, (slot, name) => (name in params ? String(params[name]) : slot));
  };
}
