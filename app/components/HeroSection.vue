<script setup lang="ts">
import { HERO } from '~/content/site'
</script>

<template>
  <section
    id="hero"
    class="flex min-h-screen items-center justify-center px-6 py-20"
  >
    <div class="w-full max-w-4xl">
      <div class="flex flex-col items-start gap-12 md:flex-row">
        <div class="shrink-0">
          <div
            class="h-56 w-56 overflow-hidden rounded-2xl border border-zinc-800 sm:h-64 sm:w-64"
          >
            <!--
              Width/height are the intrinsic pixel size of the source file, so
              the browser reserves the box and the page does not jump when the
              image lands. `fetchpriority="high"` because this is the LCP image.
            -->
            <img
              :src="HERO.portraitSrc"
              :alt="HERO.portraitAlt"
              width="620"
              height="617"
              fetchpriority="high"
              class="h-full w-full object-cover"
            />
          </div>
        </div>

        <div class="flex-1">
          <div class="space-y-4">
            <p
              class="heading mb-0 text-sm tracking-wider text-yellow-500 uppercase"
            >
              {{ HERO.eyebrow }}
            </p>
            <h1 class="mt-auto text-5xl md:text-7xl">
              <span class="font-mono text-4xl">{{ HERO.greeting }}</span>
              <br />
              <span class="text-yellow-500">{{ HERO.name }}</span>
            </h1>
            <p class="mb-6 max-w-2xl text-xl text-zinc-400">
              {{ HERO.tagline }}
            </p>
          </div>

          <div class="mb-2 flex flex-wrap items-center gap-4">
            <a
              :href="HERO.ctaHref"
              class="flex items-center gap-2 rounded-lg bg-yellow-500 px-6 py-3 font-bold text-black transition-colors hover:bg-yellow-600"
            >
              {{ HERO.ctaLabel }}
              <AppIcon name="mail" class="h-4 w-4" />
            </a>
          </div>

          <ul class="mt-4 mb-2 flex flex-wrap items-center gap-4">
            <li v-for="social in HERO.socials" :key="social.href">
              <a
                :href="social.href"
                target="_blank"
                rel="noopener noreferrer"
                class="block rounded-sm text-zinc-300 transition-colors hover:text-yellow-500"
              >
                <AppIcon
                  :name="social.icon"
                  :title="social.label"
                  class="h-6 w-6"
                />
              </a>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>
