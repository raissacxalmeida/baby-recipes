import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
