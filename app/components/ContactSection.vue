<script setup lang="ts">
import { CONTACT } from '~/content/site'

type SubmitStatus = 'idle' | 'success' | 'error'

const form = reactive({ name: '', email: '', message: '' })
const isSubmitting = ref(false)
const status = ref<SubmitStatus>('idle')

/**
 * Where the form posts. The reference site posts to a PHP endpoint that
 * forwards to Slack; Cloudflare Pages cannot run PHP, so the target is
 * configurable via `NUXT_PUBLIC_CONTACT_ENDPOINT`. See README — a replacement
 * endpoint is a separate ticket.
 */
const endpoint = useRuntimeConfig().public.contactEndpoint

const submit = async () => {
  isSubmitting.value = true
  status.value = 'idle'

  try {
    await $fetch(endpoint, {
      method: 'POST',
      body: {
        name: form.name,
        email: form.email,
        message: form.message,
        // Submit only ever runs in the browser, so `window` is safe here.
        source: window.location.href,
      },
    })
    status.value = 'success'
    form.name = ''
    form.email = ''
    form.message = ''
  } catch {
    status.value = 'error'
  } finally {
    isSubmitting.value = false
  }
}
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

      <div class="grid gap-12 md:grid-cols-2">
        <div class="space-y-8">
          <p class="text-zinc-400">{{ CONTACT.intro }}</p>

          <ul class="space-y-6">
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

        <form
          :aria-label="CONTACT.form.label"
          class="space-y-4"
          @submit.prevent="submit"
        >
          <!--
            `aria-live` so a screen reader announces the result; the region is
            always present so the announcement is not missed.
          -->
          <div aria-live="polite">
            <p
              v-if="status === 'success'"
              class="rounded border border-green-500/20 bg-green-500/10 p-4 text-green-400"
            >
              {{ CONTACT.form.successMessage }}
            </p>
            <p
              v-else-if="status === 'error'"
              class="rounded border border-red-500/20 bg-red-500/10 p-4 text-red-400"
            >
              {{ CONTACT.form.errorMessage }}
            </p>
          </div>

          <div v-for="field in CONTACT.form.fields" :key="field.name">
            <label :for="`contact-${field.name}`" class="mb-2 block text-white">
              {{ field.label }}
            </label>
            <textarea
              v-if="field.type === 'textarea'"
              :id="`contact-${field.name}`"
              v-model="form[field.name]"
              :name="field.name"
              :placeholder="field.placeholder"
              required
              rows="5"
              class="w-full resize-none rounded border border-zinc-800 bg-zinc-900 px-4 py-3 text-white focus:border-yellow-500 focus:outline-none"
            />
            <input
              v-else
              :id="`contact-${field.name}`"
              v-model="form[field.name]"
              :type="field.type"
              :name="field.name"
              :placeholder="field.placeholder"
              required
              class="w-full rounded border border-zinc-800 bg-zinc-900 px-4 py-3 text-white focus:border-yellow-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            :disabled="isSubmitting"
            class="w-full rounded bg-yellow-500 px-6 py-3 text-black transition-colors hover:bg-yellow-600 disabled:cursor-not-allowed disabled:bg-yellow-500/50"
          >
            {{
              isSubmitting
                ? CONTACT.form.submittingLabel
                : CONTACT.form.submitLabel
            }}
          </button>
        </form>
      </div>
    </div>
  </section>
</template>
