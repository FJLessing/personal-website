<script setup lang="ts">
import { FOOTER } from '~/content/site'

/**
 * `useState` rather than a bare `new Date()`: the year is computed once on the
 * server, serialised into the payload and reused on the client. A plain call
 * would be recomputed during hydration and mismatch across a new year.
 */
const year = useState('footer-year', () => new Date().getFullYear())
</script>

<template>
  <footer class="border-t border-zinc-800 bg-zinc-900 px-6 py-12">
    <div class="mx-auto max-w-4xl">
      <div class="flex flex-col items-center justify-between gap-6 md:flex-row">
        <ul class="flex gap-6">
          <li v-for="social in FOOTER.socials" :key="social.href">
            <a
              :href="social.href"
              :target="social.href.startsWith('mailto:') ? undefined : '_blank'"
              :rel="
                social.href.startsWith('mailto:')
                  ? undefined
                  : 'noopener noreferrer'
              "
              class="block rounded-sm text-zinc-400 transition-colors hover:text-yellow-500"
            >
              <AppIcon
                :name="social.icon"
                :title="social.label"
                class="h-5 w-5"
              />
            </a>
          </li>
        </ul>

        <p class="flex items-center gap-2 text-sm text-zinc-400">
          {{ FOOTER.madeWithPrefix }}
          <AppIcon name="coffee" class="h-4 w-4 fill-current text-yellow-500" />
          {{ year }}
        </p>
      </div>
    </div>
  </footer>
</template>
