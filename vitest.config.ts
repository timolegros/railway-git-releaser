import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'build'],
    coverage: {
      provider: 'v8',
      reporter: process.env.CI ? ['lcovonly'] : ['text', ['json', { file: 'coverage.json' }], 'html'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'src/test/',
        'build/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
      ],
    },
  },
}); 