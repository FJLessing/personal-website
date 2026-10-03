import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    // The `nuxt` environment gives tests Nuxt's auto-imports and composables
    // (`useState`, `useRuntimeConfig`) without hand-stubbing them.
    environment: 'nuxt',
    include: ['test/**/*.spec.ts'],
  },
})
