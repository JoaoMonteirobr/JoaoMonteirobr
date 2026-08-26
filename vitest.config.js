import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.js', 'tests/integration/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov'],
      include: ['observability.js'],
      thresholds: { lines: 60, functions: 60, statements: 60, branches: 50 }
    }
  }
});
