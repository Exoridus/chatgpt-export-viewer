import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    projects: [
      {
        test: {
          name: 'node',
          include: ['tests/server/**/*.test.ts', 'tests/browser/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['./tests/setup.ts'],
          testTimeout: 30_000,
        },
      },
      {
        test: {
          name: 'frontend',
          include: ['tests/frontend/**/*.test.ts', 'tests/frontend/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['./tests/setup.ts'],
        },
      },
    ],
    coverage: { provider: 'v8', reporter: ['text', 'lcov'] },
  },
})
