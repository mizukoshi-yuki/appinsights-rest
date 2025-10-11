import { defineConfig } from 'tsup'

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
    '@nuxt/kit'
  ]
})
