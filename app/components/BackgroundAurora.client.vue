<script setup lang="ts">
import {
  ACCENT,
  ACCENT_HOT,
  ACCENT_WARM,
  AURORA_ALPHA_ONE,
  AURORA_ALPHA_THREE,
  AURORA_ALPHA_TWO,
  AURORA_GRAIN_ALPHA,
  AURORA_VIGNETTE_ALPHA,
} from '~/utils/backgrounds/palette'

/**
 * Concept three — "Aurora".
 *
 * No canvas and no JavaScript in the render path: three large radial gradients
 * drifting over a static dot grid. The only script here is the pause gate,
 * because the brief asks for one explicitly — browsers already stop ticking
 * compositor animations in a hidden tab, but "already does" is not the same as
 * "we made sure".
 *
 * Animating `transform` only keeps this on the compositor: no layout, no
 * paint, no filter. It is by some distance the cheapest of the three.
 */
const root = ref<HTMLElement | null>(null)
const paused = ref(false)

/**
 * Colours and alphas come from the shared budget rather than being typed into
 * the stylesheet, so the contrast test and the thing on screen cannot drift
 * apart. Each gradient also gets a mid stop at a third of its centre alpha,
 * which is what keeps the falloff smooth instead of banding.
 */
const stops = (colour: readonly [number, number, number], alpha: number) => {
  const rgb = colour.join(' ')
  return (
    `rgb(${rgb} / ${(alpha * 100).toFixed(1)}%), ` +
    `rgb(${rgb} / ${((alpha / 3) * 100).toFixed(1)}%) 48%, transparent 72%`
  )
}

const palette = {
  '--blob-one': stops(ACCENT, AURORA_ALPHA_ONE),
  '--blob-two': stops(ACCENT_WARM, AURORA_ALPHA_TWO),
  '--blob-three': stops(ACCENT_HOT, AURORA_ALPHA_THREE),
  '--grain-alpha': `${(AURORA_GRAIN_ALPHA * 100).toFixed(1)}%`,
  '--vignette-alpha': `${(AURORA_VIGNETTE_ALPHA * 100).toFixed(1)}%`,
}

onMounted(() => {
  const el = root.value
  if (!el) return

  let onScreen = true
  const sync = () => {
    paused.value = !onScreen || document.visibilityState !== 'visible'
  }

  const observer = new IntersectionObserver((entries) => {
    onScreen = entries.some((entry) => entry.isIntersecting)
    sync()
  })
  observer.observe(el)
  document.addEventListener('visibilitychange', sync)
  sync()

  onBeforeUnmount(() => {
    observer.disconnect()
    document.removeEventListener('visibilitychange', sync)
  })
})
</script>

<template>
  <div
    ref="root"
    class="aurora h-full w-full"
    :class="{ 'is-paused': paused }"
    :style="palette"
  >
    <div class="blob blob-one" />
    <div class="blob blob-two" />
    <div class="blob blob-three" />
    <div class="grain" />
    <div class="vignette" />
  </div>
</template>

<style scoped>
.aurora {
  position: relative;
  overflow: hidden;
}

.blob {
  position: absolute;
  width: 95vmax;
  height: 95vmax;
  border-radius: 9999px;
  /*
   * A soft-stopped radial gradient instead of `filter: blur()`. Same look,
   * none of the repeated full-size blur passes.
   */
  will-change: transform;
}

.blob-one {
  top: -32vmax;
  left: -26vmax;
  background: radial-gradient(closest-side, var(--blob-one));
  animation: drift-one 52s ease-in-out infinite;
}

.blob-two {
  right: -34vmax;
  bottom: -30vmax;
  background: radial-gradient(closest-side, var(--blob-two));
  animation: drift-two 67s ease-in-out infinite;
}

.blob-three {
  top: 18vmax;
  right: -20vmax;
  width: 65vmax;
  height: 65vmax;
  background: radial-gradient(closest-side, var(--blob-three));
  animation: drift-three 43s ease-in-out infinite;
}

/*
 * Static print-like texture that the aurora glows through. Ties the soft
 * gradients back to the monospace type without costing a repaint.
 */
.grain {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(
    rgb(255 255 255 / var(--grain-alpha)) 1px,
    transparent 1px
  );
  background-size: 22px 22px;
}

/* Keeps the centre of the page dark so body text never loses contrast. */
.vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse at center,
    transparent 35%,
    rgb(0 0 0 / var(--vignette-alpha)) 100%
  );
}

@keyframes drift-one {
  0%,
  100% {
    transform: translate3d(0, 0, 0) scale(1);
  }
  50% {
    transform: translate3d(9vmax, 6vmax, 0) scale(1.08);
  }
}

@keyframes drift-two {
  0%,
  100% {
    transform: translate3d(0, 0, 0) scale(1.05);
  }
  50% {
    transform: translate3d(-11vmax, -7vmax, 0) scale(1);
  }
}

@keyframes drift-three {
  0%,
  100% {
    transform: translate3d(0, 0, 0);
  }
  50% {
    transform: translate3d(-6vmax, 10vmax, 0);
  }
}

.is-paused .blob {
  animation-play-state: paused;
}

/* A phone does not need the third layer, and the grid is tighter at 360px. */
@media (width <= 640px) {
  .blob-three {
    display: none;
  }

  .grain {
    background-size: 16px 16px;
  }
}

/*
 * Not "slower": off. The composition stays, so the page still has its
 * atmosphere, it just does not move.
 */
@media (prefers-reduced-motion: reduce) {
  .blob {
    animation: none !important;
    will-change: auto;
  }
}
</style>
