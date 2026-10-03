<script setup lang="ts">
import { CONTACT } from '~/content/site'

type SubmitStatus = 'idle' | 'success' | 'error' | 'rate-limited'

/**
 * The form posts to `server/api/contact.post.ts`, which relays to Slack. The
 * webhook URL is private runtime config, so only the server can see whether
 * it is set. It decides once, during SSR, and the answer reaches the client in
 * the payload. Without a webhook there is no form: a form that can only fail
 * is worse than none. The links below work either way.
 */
const formEnabled = useState(
  'contact-form-enabled',
  () => import.meta.server && Boolean(useRuntimeConfig().slackWebhookUrl),
)

// `website` is the honeypot. People never see it; bots fill it in.
const form = reactive({ name: '', email: '', message: '', website: '' })
const isSubmitting = ref(false)
const status = ref<SubmitStatus>('idle')

const submit = async () => {
  isSubmitting.value = true
  status.value = 'idle'

  try {
    await $fetch('/api/contact', { method: 'POST', body: { ...form } })
    status.value = 'success'
    form.name = ''
    form.email = ''
    form.message = ''
  } catch (error) {
    // A 429 gets its own message; it may not be this visitor's fault (a
    // shared office address, or the hourly cap), and retrying will not help.
    const code = (error as { statusCode?: number } | null)?.statusCode
    status.value = code === 429 ? 'rate-limited' : 'error'
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

      <div :class="formEnabled ? 'grid gap-12 md:grid-cols-2' : 'space-y-10'">
        <div :class="formEnabled ? 'space-y-8' : 'space-y-10'">
          <p class="max-w-2xl text-zinc-400">{{ CONTACT.intro }}</p>

          <ul
            :class="
              formEnabled
                ? 'space-y-6'
                : 'grid gap-6 sm:grid-cols-2 lg:grid-cols-3'
            "
          >
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
          v-if="formEnabled"
          :aria-label="CONTACT.form.label"
          class="relative space-y-4"
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
            <p
              v-else-if="status === 'rate-limited'"
              class="rounded border border-red-500/20 bg-red-500/10 p-4 text-red-400"
            >
              {{ CONTACT.form.rateLimitedMessage }}
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
              :maxlength="field.maxLength"
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
              :maxlength="field.maxLength"
              :autocomplete="field.autocomplete"
              required
              class="w-full rounded border border-zinc-800 bg-zinc-900 px-4 py-3 text-white focus:border-yellow-500 focus:outline-none"
            />
          </div>

          <!-- Honeypot: off screen, out of the tab order, hidden from AT. -->
          <div
            aria-hidden="true"
            class="absolute -left-[9999px] h-px w-px overflow-hidden"
          >
            <label for="contact-website">Leave this empty</label>
            <input
              id="contact-website"
              v-model="form.website"
              type="text"
              name="website"
              tabindex="-1"
              autocomplete="off"
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

          <p class="text-sm text-zinc-400">{{ CONTACT.form.privacyNote }}</p>
        </form>
      </div>
    </div>
  </section>
</template>
