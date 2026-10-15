import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:3000' } },
  test: {
    environment: 'node',
    hookTimeout: 60000,
    testTimeout: 30000,
    environmentMatchGlobs: [['test/**/*.test.jsx', 'jsdom']],
  },
});
