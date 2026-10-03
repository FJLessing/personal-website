<script setup lang="ts">
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
 * It is deliberately empty. The replacement for the old `GameOfLifeBackground`
 * is a separate task and drops straight in here — no other file needs to
 * change.
 *
 * Whatever lands here must:
 *   - cap work on small screens,
 *   - pause when `document.visibilityState !== 'visible'`,
 *   - honour `prefers-reduced-motion: reduce`,
 *   - stay behind the content (`-z-10`) and never capture pointer events that
 *     belong to the page.
 */
</script>

<template>
  <div
    aria-hidden="true"
    class="pointer-events-none fixed inset-0 -z-10"
    data-testid="site-background"
  />
</template>
