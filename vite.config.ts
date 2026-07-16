import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// GitHub Pages project site is served from https://<owner>.github.io/drazgresle/,
// so every built asset URL must be prefixed with the repository name.
export default defineConfig({
  base: '/drazgresle/',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Keep React in its own stable vendor chunk so app-code deploys don't
        // force clients to re-download it.
        manualChunks: { react: ['react', 'react-dom'] },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
