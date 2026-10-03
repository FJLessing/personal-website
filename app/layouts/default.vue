<script setup lang="ts">
/**
 * `navBase` is handed straight to `SiteNavigation`. The home page leaves it
 * empty so the nav keeps its same-page hash links; `app/error.vue` passes `/`
 * so those links point back at the home route instead of nowhere.
 */
withDefaults(defineProps<{ navBase?: string }>(), { navBase: '' })
</script>

<template>
  <div>
    <SiteNavigation :base="navBase" />
    <main id="main">
      <slot />
    </main>
    <SiteFooter />
  </div>
</template>
