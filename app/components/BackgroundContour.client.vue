<script setup lang="ts">
import { createContourScene } from '~/utils/backgrounds/contourScene'

/**
 * Concept one — "Contour". Mount boundary only; everything that matters is in
 * the scene module and the canvas runtime.
 */
const { canvas } = useBackgroundCanvas(createContourScene, {
  // Isolines move slowly enough that 24fps is indistinguishable from 60, and
  // each frame resamples the whole field, so this is the main cost control.
  fps: 24,
  smallFps: 15,
})
</script>

<template>
  <canvas ref="canvas" class="block h-full w-full" />
</template>
