<script setup lang="ts">
import { SKILLS } from '~/content/site'
</script>

<template>
  <section id="skills" class="px-6 py-20">
    <div
      class="mx-auto max-w-4xl rounded border border-zinc-800 bg-zinc-900 px-6 py-12 xl:p-12"
    >
      <SectionHeading
        :heading="SKILLS.heading"
        class="mb-12 text-3xl md:text-4xl"
      />

      <div class="grid gap-8 md:grid-cols-2">
        <div
          v-for="category in SKILLS.categories"
          :key="category.title"
          class="space-y-4"
        >
          <h3 class="text-xl text-white">{{ category.title }}</h3>
          <ul class="flex flex-wrap gap-2">
            <li
              v-for="skill in category.skills"
              :key="skill"
              class="cursor-default rounded bg-zinc-800 px-4 py-2 text-zinc-300 transition-colors hover:bg-yellow-500 hover:text-black"
            >
              {{ skill }}
            </li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>
