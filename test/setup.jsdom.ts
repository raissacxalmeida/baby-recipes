import { afterEach } from 'vitest';
import { setLanguage } from '../src/client/i18n/index.js';

// The language is a module-level choice, so no test may leak it into the next one.
afterEach(() => {
  setLanguage('en');
  if (typeof localStorage !== 'undefined') localStorage.clear();
});

// Radix UI expects a few browser APIs that jsdom does not implement.
if (typeof window !== 'undefined') {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
}
