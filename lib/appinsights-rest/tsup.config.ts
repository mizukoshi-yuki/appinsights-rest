import { defineConfig } from 'tsup'
import pkg from './package.json'

// Injected into `core/client.ts` via esbuild's `define`. This avoids importing
// `package.json` at runtime, which would otherwise cause the full manifest
// (devDependencies, repository URL, etc.) to be inlined into `dist/index.mjs`.
const SDK_VERSION_DEFINE = JSON.stringify(`custom-rest-api:${pkg.version}`)

export default defineConfig({
  entry: ['index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  minify: false,
  external: [
    'nuxt',
    'nitropack',
    /^#nitro/,
    'h3',
    '@nuxt/kit',
  ],
  esbuildOptions(options) {
    options.define = {
      ...options.define,
      __SDK_VERSION__: SDK_VERSION_DEFINE,
    }
  },
})
