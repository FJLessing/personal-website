<script setup lang="ts">
import type { NuxtError } from '#app'
import { ERROR, SITE_META, SKIP_LINK_LABEL } from '~/content/site'

/**
 * The error page.
 *
 * Nuxt renders this *instead of* `app.vue`, not inside it, so the backdrop,
 * the background layer and the skip link are repeated here. They are the only
 * thing this file duplicates; the nav and footer still come from the default
 * layout, and all copy still comes from the content module.
 */
const props = defineProps<{ error: NuxtError }>()

/** Nitro always sets a status, but the prop's type allows it to be missing. */
const statusCode = computed(() => props.error?.statusCode ?? 500)

const variant = computed(() => {
  if (statusCode.value === 404) return ERROR.notFound
  if (statusCode.value >= 500) return ERROR.serverError
  return ERROR.fallback
})

/**
 * The underlying message can carry stack frames, file paths or query
 * fragments, so it is shown only in development and never in a production
 * build, where `import.meta.dev` is statically false and this is dropped.
 */
const diagnostics = computed(() => {
  if (!import.meta.dev) return ''

  // Nitro usually sets both to the same string; show it once when it does.
  const lines = [props.error?.statusMessage, props.error?.message].filter(
    (line): line is string => Boolean(line),
  )
  return [...new Set(lines)].join(' | ')
})

/**
 * Plain anchors, so both links still work with JavaScript off or still
 * loading. When Vue is running, clearing the error and routing is smoother
 * than a full document load, but an unmodified left click only, so
 * ctrl/cmd-click still opens a new tab.
 */
const navigate = (event: MouseEvent, to: string) => {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  clearError({ redirect: to })
}

useSeoMeta({
  title: () =>
    `${statusCode.value} ${variant.value.title} | ${SITE_META.author}`,
  description: () => variant.value.message,
  // Overrides the site-wide `index, follow` in nuxt.config: an error page must
  // never enter an index, but outbound links are still worth following.
  robots: 'noindex, follow',
  ogTitle: () => `${statusCode.value} ${variant.value.title}`,
  ogDescription: () => variant.value.message,
  ogType: 'website',
  ogSiteName: SITE_META.siteName,
  ogLocale: SITE_META.locale,
})
</script>

<template>
  <!-- Mirrors the wrapper in `app.vue`; see the note there on `isolate`. -->
  <div class="isolate min-h-screen bg-[#0d0d0d] text-white">
    <SiteBackground />

    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[60] focus:rounded focus:bg-yellow-500 focus:px-4 focus:py-2 focus:text-black"
    >
      {{ SKIP_LINK_LABEL }}
    </a>

    <NuxtLayout nav-base="/">
      <!-- Same shape as the hero: eyebrow, heading, paragraph, actions. -->
      <section
        class="flex min-h-screen items-center justify-center px-6 py-20"
        data-testid="error-page"
      >
        <div class="w-full max-w-4xl">
          <p
            class="heading mb-0 text-sm tracking-wider text-yellow-500 uppercase"
          >
            {{ ERROR.codePrefix }} {{ statusCode }}
          </p>

          <SectionHeading
            as="h1"
            :heading="variant.heading"
            class="mt-4 text-5xl md:text-7xl"
          />

          <p class="mt-6 max-w-2xl text-xl text-zinc-400">
            {{ variant.message }}
          </p>

          <div class="mt-8 flex flex-wrap items-center gap-4">
            <a
              :href="ERROR.homeHref"
              class="rounded-lg bg-yellow-500 px-6 py-3 font-bold text-black transition-colors hover:bg-yellow-600"
              @click="navigate($event, ERROR.homeHref)"
            >
              {{ ERROR.homeLabel }}
            </a>

            <a
              :href="ERROR.contactHref"
              class="flex items-center gap-2 rounded-lg border border-zinc-700 px-6 py-3 text-zinc-200 transition-colors hover:border-yellow-500 hover:text-yellow-500"
              @click="navigate($event, ERROR.contactHref)"
            >
              {{ ERROR.contactLabel }}
              <AppIcon name="mail" class="h-4 w-4" />
            </a>
          </div>

          <div v-if="diagnostics" class="mt-12 border-t border-zinc-800 pt-6">
            <h2 class="text-sm tracking-wider text-zinc-400 uppercase">
              {{ ERROR.diagnosticsLabel }}
            </h2>
            <p class="mt-2 font-mono text-sm break-words text-zinc-400">
              {{ diagnostics }}
            </p>
          </div>
        </div>
      </section>
    </NuxtLayout>
  </div>
</template>
