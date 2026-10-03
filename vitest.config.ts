import { isBuiltin } from 'node:module'
import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  plugins: [
    {
      // Vite 8 resolves Node built-ins in the `client` environment, which the
      // `nuxt` test environment runs in, to a bare `__vite-browser-external`
      // that has lost the module name, so vitest then fails to load `node:`.
      // Specs run in Node, so keep built-ins external under their real name.
      name: 'test:node-builtins',
      enforce: 'pre',
      resolveId(id) {
        if (isBuiltin(id)) return { id, external: true }
      },
    },
  ],
  test: {
    // The `nuxt` environment gives tests Nuxt's auto-imports and composables
    // (`useState`, `useRuntimeConfig`) without hand-stubbing them.
    environment: 'nuxt',
    include: ['test/**/*.spec.ts'],
  },
})
