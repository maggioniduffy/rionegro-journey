import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the static build runs from any file server or zipped itch.io upload.
  base: './',
  build: { target: 'es2022' },
  test: { include: ['src/**/*.test.ts'] },
});
