// @ts-check
import prettier from 'eslint-config-prettier'
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    rules: {
      // Formatting is Prettier's job; keep ESLint to correctness.
      'vue/multi-word-component-names': 'error',
      'vue/no-v-html': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Nuxt derives these component names from the file path, so single-word
    // names are the convention, not an accident.
    files: ['app/pages/**/*.vue', 'app/layouts/**/*.vue', 'app/app.vue'],
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },
  // Must come last so it can switch off the stylistic rules above it.
  prettier,
)
