<script setup lang="ts">
import { SKIP_LINK_LABEL } from '~/content/site'
</script>

<template>
  <div class="min-h-screen bg-black/90 text-white">
    <!--
      The backdrop the animated background will sit on. Painted in CSS so the
      page looks right with JavaScript disabled, matching the colour the
      reference canvas cleared to.
    -->
    <div aria-hidden="true" class="fixed inset-0 -z-20 bg-[#232323]" />
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
