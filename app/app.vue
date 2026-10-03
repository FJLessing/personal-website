<script setup lang="ts">
import { SKIP_LINK_LABEL } from '~/content/site'
</script>

<template>
  <!--
    `isolate` is load-bearing. Without it this element never forms a stacking
    context, so its own background paints *after* its negative-z-index
    children — the background canvas ended up underneath the page colour and
    was multiplied down to roughly a tenth of its intended brightness. With
    `isolate`, the order inside this element is: this background, then the
    `-z-10` background layer, then the content.

    The base colour is opaque and server-rendered, so the page is the right
    colour with JavaScript disabled or still loading, and it is the backdrop
    `app/utils/backgrounds/palette.ts` composites every highlight against.
    Change one and change the other; the contrast test checks they agree.
  -->
  <div class="isolate min-h-screen bg-[#0d0d0d] text-white">
    <SiteBackground />

    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[60] focus:rounded focus:bg-yellow-500 focus:px-4 focus:py-2 focus:text-black"
    >
      {{ SKIP_LINK_LABEL }}
    </a>

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>
