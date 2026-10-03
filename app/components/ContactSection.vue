<script setup lang="ts">
import { CONTACT } from '~/content/site'

/**
 * Channels only, no form. The reference site posted to a PHP script that
 * relayed to Slack; a Nitro Node server has no PHP runtime, and the
 * replacement server route has no delivery channel to send to yet. A form
 * that always lands in its own error branch is worse than no form, so the
 * links that do work carry the section until the endpoint exists.
 */
</script>

<template>
  <section id="contact" class="px-6 py-20">
    <div
      class="mx-auto max-w-4xl rounded border border-zinc-800 bg-zinc-900 px-6 py-12 xl:p-12"
    >
      <SectionHeading
        :heading="CONTACT.heading"
        class="mb-12 text-3xl md:text-4xl"
      />

      <div class="space-y-10">
        <p class="max-w-2xl text-zinc-400">{{ CONTACT.intro }}</p>

        <ul class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <li
            v-for="channel in CONTACT.channels"
            :key="channel.href"
            class="flex items-center gap-4 text-zinc-400"
          >
            <span
              class="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-yellow-500/10"
            >
              <AppIcon :name="channel.icon" class="h-6 w-6 text-yellow-500" />
            </span>
            <span class="min-w-0">
              <span class="block text-white">{{ channel.label }}</span>
              <a
                :href="channel.href"
                :target="channel.external ? '_blank' : undefined"
                :rel="channel.external ? 'noopener noreferrer' : undefined"
                class="rounded-sm break-words transition-colors hover:text-yellow-500"
                >{{ channel.value }}</a
              >
            </span>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
