import { defineConfig } from 'vitest/config'
import pkg from './package.json'

// Mirror tsup's `esbuildOptions.define` so that `core/client.ts` can resolve
// `__SDK_VERSION__` when the source is executed directly by vitest (which
// bypasses tsup).
const SDK_VERSION_DEFINE = JSON.stringify(`custom-rest-api:${pkg.version}`)

export default defineConfig({
  define: {
    __SDK_VERSION__: SDK_VERSION_DEFINE,
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['core/**/*.ts', 'helpers.ts'],
      exclude: ['**/*.test.ts', 'dist/**'],
    },
  },
})
