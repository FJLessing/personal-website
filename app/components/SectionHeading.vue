<script setup lang="ts">
import type { AccentHeading } from '~/content/site'

/**
 * Renders a heading where one run of words is painted in the accent colour,
 * e.g. "About <accent>Me</accent>".
 *
 * Spacing is baked into the content strings, so the spans are emitted with no
 * whitespace between them.
 */
withDefaults(
  defineProps<{
    heading: AccentHeading
    /** Heading level to render. Sections use h2, cards use h3. */
    as?: 'h1' | 'h2' | 'h3'
    /** Accent colour class. Section titles use 500, interest cards use 600. */
    accentClass?: string
  }>(),
  { as: 'h2', accentClass: 'text-yellow-500' },
)
</script>

<template>
  <component :is="as"
    ><span v-if="heading.lead">{{ heading.lead }}</span
    ><span :class="accentClass">{{ heading.accent }}</span
    ><span v-if="heading.trail">{{ heading.trail }}</span></component
  >
</template>
