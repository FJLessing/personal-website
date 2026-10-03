<script setup lang="ts">
import { ABOUT } from '~/content/site'
</script>

<template>
  <section id="about" class="px-6 py-20">
    <div
      class="mx-auto max-w-4xl rounded border border-zinc-800 bg-zinc-900 px-6 py-12 xl:px-12"
    >
      <SectionHeading
        :heading="ABOUT.heading"
        class="mb-12 text-3xl md:text-4xl"
      />

      <div class="grid gap-12 md:grid-cols-2 xl:grid-cols-3">
        <div class="space-y-4 text-zinc-400 xl:col-span-2">
          <p v-for="paragraph in ABOUT.paragraphs" :key="paragraph">
            {{ paragraph }}
          </p>
        </div>

        <div class="space-y-6">
          <div v-for="aside in ABOUT.asides" :key="aside.title">
            <h3 class="mb-2 text-lg text-white">{{ aside.title }}</h3>
            <p v-for="line in aside.lines" :key="line" class="text-zinc-400">
              {{ line }}
            </p>
            <p v-if="aside.note" class="text-sm text-zinc-500">
              {{ aside.note }}
            </p>
            <p v-if="aside.link" class="text-zinc-400">
              <a
                :href="aside.link.href"
                target="_blank"
                rel="noopener noreferrer"
                class="rounded-sm transition-colors hover:text-yellow-500"
                >{{ aside.link.prefix }}<u>{{ aside.link.label }}</u></a
              >
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
