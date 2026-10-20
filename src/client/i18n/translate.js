// Pure lookup: no globals, so it is easy to test. Entries are strings or { one, other } plurals using {count}.
export function createTranslator(catalogs, fallback = 'en') {
  return (language, key, params = {}) => {
    const entry = catalogs[language]?.[key] ?? catalogs[fallback]?.[key];
    if (entry === undefined) return key;
    const text = typeof entry === 'string'
      ? entry
      : entry[new Intl.PluralRules(language).select(Number(params.count))] ?? entry.other;
    return text.replace(/\{(\w+)\}/g, (slot, name) => (name in params ? String(params[name]) : slot));
  };
}
