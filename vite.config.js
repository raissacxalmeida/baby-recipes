import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Imports keep their `.js`/`.jsx` specifiers while files become TypeScript. Vite 5 only maps `./x.js` to `x.ts`
// when the importer is itself TypeScript, so this does it for JavaScript importers too.
const tsSpecifiers = {
  name: 'ts-specifiers',
  enforce: 'pre',
  resolveId(source, importer) {
    if (!importer || !source.startsWith('.') || !/\.jsx?$/.test(source)) return null;
    const file = resolve(dirname(importer.split('?')[0]), source);
    if (existsSync(file)) return null;
    const stem = file.replace(/\.jsx?$/, '');
    return [`${stem}.ts`, `${stem}.tsx`].find((candidate) => existsSync(candidate)) ?? null;
  },
};

export default defineConfig({
  plugins: [tsSpecifiers, react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src/client', import.meta.url)) } },
  server: { proxy: { '/api': 'http://127.0.0.1:3000' } },
  test: {
    environment: 'node',
    // Git worktrees live inside the repo; their copies of the tests must not run from here.
    exclude: [...configDefaults.exclude, '.claude/worktrees/**'],
    hookTimeout: 60000,
    testTimeout: 30000,
    environmentMatchGlobs: [['test/**/*.test.jsx', 'jsdom']],
    setupFiles: ['./test/setup.jsdom.js'],
  },
});
