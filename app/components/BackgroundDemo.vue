<script setup lang="ts">
/**
 * Shared shell for the three background concept demos.
 *
 * It renders the real sections, on the real dark theme, so each concept is
 * judged in the context it has to live in rather than against an empty page.
 * The switcher is a plain list of links: no traps, no overlay over the
 * content, reachable by keyboard like anything else.
 *
 * This component and the `/bg/*` routes are scaffolding for one decision and
 * get deleted once the owner has picked.
 */
defineProps<{
  /** Short name of the concept, as offered to the owner. */
  title: string
  /** One line on what it does. */
  blurb: string
}>()

const DEMOS = [
  { to: '/bg/one', label: 'One · Contour' },
  { to: '/bg/two', label: 'Two · Glyph field' },
  { to: '/bg/three', label: 'Three · Aurora' },
]

const route = useRoute()
</script>

<template>
  <div>
    <HeroSection />
    <AboutSection />
    <ExperienceSection />
    <SkillsSection />
    <InterestsSection />
    <ContactSection />

    <aside
      class="fixed right-4 bottom-4 z-50 max-w-[18rem] rounded-lg border border-zinc-700 bg-black/85 p-3 text-xs text-zinc-300 backdrop-blur-sm"
    >
      <p class="heading mb-1 text-sm text-yellow-500">{{ title }}</p>
      <p class="mb-2 text-zinc-400">{{ blurb }}</p>
      <nav aria-label="Background concepts">
        <ul class="flex flex-wrap gap-2">
          <li v-for="demo in DEMOS" :key="demo.to">
            <NuxtLink
              :to="demo.to"
              class="block rounded border border-zinc-700 px-2 py-1 hover:border-yellow-500 hover:text-yellow-500"
              :class="
                route.path === demo.to
                  ? 'border-yellow-500 text-yellow-500'
                  : ''
              "
              :aria-current="route.path === demo.to ? 'page' : undefined"
            >
              {{ demo.label }}
            </NuxtLink>
          </li>
        </ul>
      </nav>
    </aside>
  </div>
</template>
