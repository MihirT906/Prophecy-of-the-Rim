import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: { target: 'es2022', assetsInlineLimit: 1e9, modulePreload: false },
  server: { open: false },
  test: { include: ['src/**/*.test.ts'] },
});
