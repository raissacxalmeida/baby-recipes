import catalogs from '../../src/client/i18n/catalogs.js';

// Every piece of text a person (or a screen reader) meets under `root`: each text node, each aria-label.
function textsUnder(root) {
  const seen = new Set();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent.trim();
    if (text) seen.add(text);
  }
  root.querySelectorAll('[aria-label]').forEach((el) => seen.add(el.getAttribute('aria-label')));
  return seen;
}

// English catalog texts (for the keys under `prefixes`) that are still on screen under `root` although `language`
// has its own wording for them. A hard-coded English literal in a component shows up here.
// Only whole texts are compared, so "Cancelar" never counts as a leftover "Cancel".
export function englishLeft(root, language, prefixes) {
  const seen = textsUnder(root);
  return Object.entries(catalogs.en)
    .filter(([key]) => prefixes.some((p) => key.startsWith(p)))
    .filter(([, text]) => typeof text === 'string' && !/\{\w+\}/.test(text))
    .filter(([key, text]) => catalogs[language][key] !== text)
    .map(([, text]) => text)
    .filter((text) => seen.has(text));
}
