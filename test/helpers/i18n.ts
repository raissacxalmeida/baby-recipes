import catalogs from '../../src/client/i18n/catalogs.js';
import type { CatalogKey } from '../../src/client/i18n/en.js';
import type { Language } from '../../src/shared/types.js';

// Every piece of text a person (or a screen reader) meets under `root`: each text node, each aria-label.
function textsUnder(root: Element): Set<string | null> {
  const seen = new Set<string | null>();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    // A text node's textContent is never null (only a document's or doctype's is).
    const text = (node.textContent as string).trim();
    if (text) seen.add(text);
  }
  root.querySelectorAll('[aria-label]').forEach((el) => seen.add(el.getAttribute('aria-label')));
  return seen;
}

// English catalog texts (for the keys under `prefixes`) that are still on screen under `root` although `language`
// has its own wording for them. A hard-coded English literal in a component shows up here.
// Only whole texts are compared, so "Cancelar" never counts as a leftover "Cancel".
export function englishLeft(root: Element, language: Language, prefixes: string[]): string[] {
  const seen = textsUnder(root);
  return Object.entries(catalogs.en)
    .filter(([key]) => prefixes.some((p) => key.startsWith(p)))
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && !/\{\w+\}/.test(entry[1]))
    // Object.entries widens the keys to string; they are the English catalog's own keys.
    .filter(([key, text]) => catalogs[language][key as CatalogKey] !== text)
    .map(([, text]) => text)
    .filter((text) => seen.has(text));
}
