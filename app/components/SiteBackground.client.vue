<script setup lang="ts">
import { createContourScene } from '~/utils/backgrounds/contourScene'

/**
 * The site background: "Contour", a slow topographic height field drawn as
 * isolines, with the cursor pressing a dent into the terrain.
 *
 * The `.client` suffix means Nuxt never renders this on the server, so the
 * scene and the canvas runtime are free to touch `window`, `document`,
 * `requestAnimationFrame` and a canvas context without breaking SSR or causing
 * a hydration mismatch. The server emits nothing for this component; the solid
 * backdrop is painted by `app.vue`, so the page looks right with JavaScript
 * disabled or still loading.
 *
 * Everything the background has to obey (reduced motion, pausing when hidden
 * or off-screen, capping the backing store, cutting work on small screens)
 * lives in `useBackgroundCanvas`. This component is the mount boundary and the
 * `aria-hidden` wrapper, nothing more.
 */
const { canvas } = useBackgroundCanvas(createContourScene, {
  // Isolines move slowly enough that 24fps is indistinguishable from 60, and
  // each frame resamples the whole field, so this is the main cost control.
  fps: 24,
  smallFps: 15,
})
</script>

<template>
  <div
    aria-hidden="true"
    class="pointer-events-none fixed inset-0 -z-10"
    data-testid="site-background"
  >
    <canvas ref="canvas" class="block h-full w-full" />
  </div>
</template>
