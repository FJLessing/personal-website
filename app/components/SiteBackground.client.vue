<script setup lang="ts">
import type { BackgroundVariant } from '~/utils/backgrounds/scene'

/**
 * Mount boundary for the animated background.
 *
 * The `.client` suffix means Nuxt never renders this on the server, so whatever
 * lands here is free to touch `window`, `document`, `requestAnimationFrame` and
 * a canvas context without breaking SSR or causing a hydration mismatch. The
 * server emits nothing for this component; the solid backdrop below is painted
 * by `app.vue` so the page looks right with JavaScript disabled or still
 * loading.
 *
 * While the three replacement concepts are up for a decision, which one mounts
 * comes from the route: the demo pages under `/bg/*` set `background` in their
 * page meta, and the real page sets nothing, so it keeps the empty slot. Once
 * the owner picks, this collapses to the single chosen component.
 */
const route = useRoute()
const variant = computed<BackgroundVariant | null>(
  () => route.meta.background ?? null,
)
</script>

<template>
  <div
    aria-hidden="true"
    class="pointer-events-none fixed inset-0 -z-10"
    data-testid="site-background"
  >
    <BackgroundContour v-if="variant === 'contour'" />
    <BackgroundGlyphs v-else-if="variant === 'glyphs'" />
    <BackgroundAurora v-else-if="variant === 'aurora'" />
  </div>
</template>
