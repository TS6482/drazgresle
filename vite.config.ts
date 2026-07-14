import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// GitHub Pages project site is served from https://<owner>.github.io/drazgresle/,
// so every built asset URL must be prefixed with the repository name.
export default defineConfig({
  base: '/drazgresle/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
