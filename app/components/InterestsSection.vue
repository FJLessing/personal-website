<script setup lang="ts">
import { INTERESTS } from '~/content/site'
</script>

<template>
  <section id="interests" class="px-6 py-20">
    <div class="mx-auto max-w-4xl rounded border border-zinc-800 bg-zinc-900">
      <SectionHeading
        :heading="INTERESTS.heading"
        class="m-6 text-3xl md:m-12 md:text-4xl"
      />

      <div class="m-6 space-y-4 md:m-12">
        <p class="text-zinc-400">{{ INTERESTS.intro }}</p>
      </div>

      <div class="flex-wrap md:flex">
        <article
          v-for="card in INTERESTS.cards"
          :key="card.heading.accent"
          class="border border-zinc-800 p-6 md:p-12"
          :class="card.span === 'half' ? 'md:basis-1/2' : 'md:basis-full'"
        >
          <SectionHeading
            :heading="card.heading"
            as="h3"
            accent-class="text-yellow-600"
            class="mb-2 text-lg text-white"
          />
          <p
            v-for="(paragraph, index) in card.paragraphs"
            :key="paragraph"
            class="text-zinc-400"
            :class="index < card.paragraphs.length - 1 ? 'mb-2' : ''"
          >
            {{ paragraph }}
          </p>
        </article>
      </div>
    </div>
  </section>
</template>
