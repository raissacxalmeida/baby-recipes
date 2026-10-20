import catalogs from '../../src/client/i18n/catalogs.js';

// English catalog texts (for the keys under `prefixes`) that are still on screen under `root` although `language`
// has its own wording for them. A hard-coded English literal in a component shows up here.
export function englishLeft(root, language, prefixes) {
  const seen = [root.textContent, ...[...root.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label'))].join('\n');
  return Object.entries(catalogs.en)
    .filter(([key]) => prefixes.some((p) => key.startsWith(p)))
    .filter(([, text]) => typeof text === 'string' && !/\{\w+\}/.test(text))
    .filter(([key, text]) => catalogs[language][key] !== text)
    .map(([, text]) => text)
    .filter((text) => seen.includes(text));
}
