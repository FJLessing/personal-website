<script setup lang="ts">
import { createFieldScene } from '~/utils/backgrounds/fieldScene'

/**
 * The site background: "Field", a grid of short yellow dashes drifting on a
 * slow flow field. The cursor, or on a phone the tilt of the device and a slow
 * wander, pushes the dashes out into a springy ring.
 *
 * The `.client` suffix means Nuxt never renders this on the server, so the
 * scene and the canvas runtime are free to touch `window`, `document`,
 * `requestAnimationFrame` and a canvas context without breaking SSR or causing
 * a hydration mismatch. The server emits nothing for this component; the solid
 * backdrop is painted by `app.vue`, so the page looks right with JavaScript
 * disabled or still loading.
 *
 * Everything the background has to obey (reduced motion, pausing when hidden
 * or off-screen, capping the backing store, cutting work on small screens,
 * listening to tilt and motion only where they make sense) lives in
 * `useBackgroundCanvas`. This component is the mount boundary and the
 * `aria-hidden` wrapper, nothing more.
 */
const { canvas } = useBackgroundCanvas(createFieldScene, {
  // Springs read as stepped below about 24fps, so this runs faster than the
  // old isolines did. A frame is a few thousand dashes in twelve strokes; if
  // a real phone struggles, lower `smallFps` first.
  fps: 30,
  smallFps: 24,
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
