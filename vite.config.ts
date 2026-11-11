import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the static build runs from any file server or zipped itch.io upload.
  base: './',
  build: { target: 'es2022' },
  // Single forked worker, no file parallelism: keeps memory low on small machines.
  test: { include: ['src/**/*.test.ts'], pool: 'forks', maxWorkers: 1, fileParallelism: false },
});
