import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    env: {
      APP_SECRET: 'vitest-only-secret-that-is-at-least-32-bytes',
      DATABASE_URL: 'postgresql://talivia:talivia@localhost:5432/talivia_test',
    },
  },
});
