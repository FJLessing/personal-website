import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Component } from 'vue'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'

import AppIcon from '~/components/AppIcon.vue'
import SectionHeading from '~/components/SectionHeading.vue'
import SiteNavigation from '~/components/SiteNavigation.vue'
import HeroSection from '~/components/HeroSection.vue'
import AboutSection from '~/components/AboutSection.vue'
import ExperienceSection from '~/components/ExperienceSection.vue'
import SkillsSection from '~/components/SkillsSection.vue'
import InterestsSection from '~/components/InterestsSection.vue'
import ContactSection from '~/components/ContactSection.vue'
import SiteFooter from '~/components/SiteFooter.vue'

/**
 * Hydration parity.
 *
 * Renders each section the way the server does, drops that HTML into a
 * container, then hydrates the same component on top of it. Vue reports any
 * server/client divergence as a `Hydration ... mismatch` console warning, so
 * the assertion is that nothing was logged.
 *
 * This is the automated stand-in for "open the page and watch the console".
 * It is what catches a `Date.now()` or a `Math.random()` creeping into a
 * render. The `control` case at the bottom proves the harness actually detects
 * a mismatch rather than passing vacuously.
 */
const SECTIONS: Record<string, Component> = {
  SiteNavigation,
  HeroSection,
  AboutSection,
  ExperienceSection,
  SkillsSection,
  InterestsSection,
  ContactSection,
  SiteFooter,
}

/** Nuxt auto-imports these; a bare `createSSRApp` needs them registered. */
const registerGlobals = (app: ReturnType<typeof createSSRApp>) => {
  app.component('AppIcon', AppIcon)
  app.component('SectionHeading', SectionHeading)
}

const renderThenHydrate = async (component: Component) => {
  const nuxtApp = useNuxtApp()

  const serverApp = createSSRApp(component)
  registerGlobals(serverApp)
  const serverHtml = await nuxtApp.runWithContext(() =>
    renderToString(serverApp),
  )

  const container = document.createElement('div')
  container.innerHTML = serverHtml
  document.body.appendChild(container)

  const clientApp = createSSRApp(component)
  registerGlobals(clientApp)
  await nuxtApp.runWithContext(() => {
    clientApp.mount(container, true)
  })
  await nextTick()

  const cleanup = () => {
    clientApp.unmount()
    container.remove()
  }

  return { serverHtml, cleanup }
}

describe('hydration parity', () => {
  let warn: ReturnType<typeof vi.spyOn>
  let error: ReturnType<typeof vi.spyOn>

  const logged = () =>
    [...warn.mock.calls, ...error.mock.calls].map((call) =>
      call.map(String).join(' '),
    )

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    error = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  for (const [name, component] of Object.entries(SECTIONS)) {
    it(`${name} hydrates onto its own server HTML silently`, async () => {
      const { serverHtml, cleanup } = await renderThenHydrate(component)

      // Guard against a vacuous pass: the server must have produced real markup
      // with every child component resolved, not an empty shell.
      expect(serverHtml.length).toBeGreaterThan(200)
      expect(serverHtml).not.toContain('Failed to resolve')

      expect(logged()).toEqual([])
      cleanup()
    })
  }

  it('control: a component that renders non-deterministically is caught', async () => {
    const Flaky = {
      setup() {
        return () => h('p', String(Math.random()))
      },
    }

    const { cleanup } = await renderThenHydrate(Flaky)

    expect(logged().join('\n')).toMatch(/[Hh]ydration/)
    cleanup()
  })
})
