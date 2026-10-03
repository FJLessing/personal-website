<script setup lang="ts">
import { NAVIGATION } from '~/content/site'

/**
 * The nav links are hash-only (`#about`), which is right on the single-page
 * home route and dead anywhere else. `base` is prefixed to every target so a
 * page that is not `/` — the error page — can emit `/#about` instead.
 */
const props = withDefaults(defineProps<{ base?: string }>(), { base: '' })

const target = (href: string) => `${props.base}${href}`
/** Home is `#` on the home page (scroll to top) and `/` everywhere else. */
const homeHref = computed(() => props.base || '#')

const isOpen = ref(false)
const close = () => {
  isOpen.value = false
}
</script>

<template>
  <nav
    :aria-label="NAVIGATION.menuLabel"
    class="fixed top-0 right-0 left-0 z-50 border-b border-zinc-800 bg-black/80 backdrop-blur-sm"
  >
    <!--
      Progressive enhancement: the toggle button needs JavaScript. Without it
      the panel stays open and the button is hidden, so the links are still
      reachable on a narrow viewport. The rule lives in `app.head.noscript` in
      nuxt.config because Vue templates cannot contain a <style> element.
    -->
    <div class="mx-auto max-w-6xl px-6 py-4">
      <div class="flex items-center justify-between">
        <a
          :href="homeHref"
          :aria-label="NAVIGATION.homeLabel"
          class="rounded-sm text-xl tracking-wider text-white"
          >{{ NAVIGATION.brandLead
          }}<span class="text-yellow-500">{{ NAVIGATION.brandAccent }}</span></a
        >

        <!-- Desktop navigation -->
        <ul class="hidden items-center gap-8 md:flex">
          <li v-for="link in NAVIGATION.links" :key="link.href">
            <a
              :href="target(link.href)"
              class="rounded-sm text-zinc-400 transition-colors hover:text-yellow-500"
              >{{ link.label }}</a
            >
          </li>
        </ul>

        <button
          id="site-nav-toggle"
          type="button"
          class="rounded-sm text-white md:hidden"
          :aria-expanded="isOpen"
          aria-controls="site-nav-panel"
          :aria-label="
            isOpen ? NAVIGATION.closeMenuLabel : NAVIGATION.openMenuLabel
          "
          @click="isOpen = !isOpen"
        >
          <AppIcon :name="isOpen ? 'close' : 'menu'" class="h-6 w-6" />
        </button>
      </div>

      <!--
        `v-show` rather than `v-if`: the links are in the server HTML for
        crawlers, and the server and the first client render agree (both closed),
        so there is no hydration mismatch.
      -->
      <div v-show="isOpen" id="site-nav-panel" class="pt-4 pb-2 md:hidden">
        <ul class="flex flex-col gap-4">
          <li v-for="link in NAVIGATION.links" :key="link.href">
            <a
              :href="target(link.href)"
              class="rounded-sm text-zinc-400 transition-colors hover:text-yellow-500"
              @click="close"
              >{{ link.label }}</a
            >
          </li>
        </ul>
      </div>
    </div>
  </nav>
</template>
