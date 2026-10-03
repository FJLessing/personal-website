<script setup lang="ts">
import { createGlyphScene } from '~/utils/backgrounds/glyphScene'

/**
 * Concept two — "Glyph field". Mount boundary only; everything that matters is
 * in the scene module and the canvas runtime.
 */
const { canvas } = useBackgroundCanvas(createGlyphScene, {
  // Flicker needs a slightly higher rate than the contours to read as alive,
  // but the per-glyph cap means the frame itself stays cheap.
  fps: 30,
  smallFps: 20,
})
</script>

<template>
  <canvas ref="canvas" class="block h-full w-full" />
</template>
