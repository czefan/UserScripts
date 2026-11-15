import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['userscripts/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
