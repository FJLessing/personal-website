<script setup lang="ts">
import { EXPERIENCE } from '~/content/site'
</script>

<template>
  <section id="experience" class="bg-zinc-900 px-6 py-20">
    <div
      class="mx-auto max-w-4xl rounded border border-zinc-800 px-6 py-12 xl:px-12"
    >
      <SectionHeading
        :heading="EXPERIENCE.heading"
        class="mb-12 text-3xl md:text-4xl"
      />

      <ol class="space-y-12">
        <li
          v-for="entry in EXPERIENCE.entries"
          :key="`${entry.company}-${entry.period}`"
          class="relative xl:border-l-2 xl:border-zinc-800 xl:pl-8"
        >
          <!--
            The timeline rail only exists from xl up, so the dot is hidden below
            that breakpoint. In the reference it stayed visible and overflowed
            the card at narrow widths.
          -->
          <span
            aria-hidden="true"
            class="absolute top-[-5px] left-[-9px] hidden h-4 w-4 rounded-full bg-yellow-500 xl:block"
          />

          <div class="space-y-3">
            <div>
              <h3 class="text-xl text-white">{{ entry.role }}</h3>
              <p class="text-yellow-500">{{ entry.company }}</p>
              <p class="text-sm text-zinc-500">{{ entry.period }}</p>
            </div>

            <p class="text-zinc-400">{{ entry.description }}</p>

            <ul class="flex flex-wrap gap-2 pt-2">
              <li
                v-for="tech in entry.tech"
                :key="tech"
                class="rounded bg-zinc-800 px-3 py-1 text-sm text-zinc-300"
              >
                {{ tech }}
              </li>
            </ul>
          </div>
        </li>
      </ol>
    </div>
  </section>
</template>
