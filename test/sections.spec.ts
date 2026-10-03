import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'

import SiteNavigation from '~/components/SiteNavigation.vue'
import HeroSection from '~/components/HeroSection.vue'
import AboutSection from '~/components/AboutSection.vue'
import ExperienceSection from '~/components/ExperienceSection.vue'
import SkillsSection from '~/components/SkillsSection.vue'
import InterestsSection from '~/components/InterestsSection.vue'
import ContactSection from '~/components/ContactSection.vue'
import SiteFooter from '~/components/SiteFooter.vue'
import SiteBackground from '~/components/SiteBackground.client.vue'

import {
  ABOUT,
  CONTACT,
  EXPERIENCE,
  FOOTER,
  HERO,
  INTERESTS,
  NAVIGATION,
  SKILLS,
} from '~/content/site'

/**
 * A smoke test per section: it mounts, and the copy that comes out is the copy
 * in the content module. That is what catches a component that silently stops
 * rendering its data, which is the failure the server HTML check also guards.
 */
describe('site sections', () => {
  it('Navigation renders the brand and every link', async () => {
    const wrapper = await mountSuspended(SiteNavigation)
    const text = wrapper.text()

    expect(text).toContain(NAVIGATION.brandLead)
    expect(text).toContain(NAVIGATION.brandAccent)
    for (const link of NAVIGATION.links) {
      expect(text).toContain(link.label)
      expect(wrapper.html()).toContain(`href="${link.href}"`)
    }
  })

  it('Navigation toggle flips aria-expanded', async () => {
    const wrapper = await mountSuspended(SiteNavigation)
    const toggle = wrapper.get('#site-nav-toggle')

    expect(toggle.attributes('aria-expanded')).toBe('false')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
  })

  it('Hero renders the headline copy and the portrait', async () => {
    const wrapper = await mountSuspended(HeroSection)
    const text = wrapper.text()

    expect(text).toContain(HERO.eyebrow)
    expect(text).toContain(HERO.name)
    expect(text).toContain(HERO.tagline)
    expect(text).toContain(HERO.ctaLabel)
    expect(wrapper.get('img').attributes('alt')).toBe(HERO.portraitAlt)
  })

  it('About renders every paragraph and aside', async () => {
    const wrapper = await mountSuspended(AboutSection)
    const text = wrapper.text()

    expect(text).toContain(ABOUT.heading.accent)
    for (const paragraph of ABOUT.paragraphs) {
      expect(text).toContain(paragraph)
    }
    for (const aside of ABOUT.asides) {
      expect(text).toContain(aside.title)
    }
  })

  it('Experience renders every role with its tech tags', async () => {
    const wrapper = await mountSuspended(ExperienceSection)
    const text = wrapper.text()

    for (const entry of EXPERIENCE.entries) {
      expect(text).toContain(entry.role)
      expect(text).toContain(entry.period)
      expect(text).toContain(entry.description)
      for (const tech of entry.tech) {
        expect(text).toContain(tech)
      }
    }
  })

  it('Skills renders every category and skill', async () => {
    const wrapper = await mountSuspended(SkillsSection)
    const text = wrapper.text()

    for (const category of SKILLS.categories) {
      expect(text).toContain(category.title)
      for (const skill of category.skills) {
        expect(text).toContain(skill)
      }
    }
  })

  it('Interests renders the intro and every card', async () => {
    const wrapper = await mountSuspended(InterestsSection)
    const text = wrapper.text()

    expect(text).toContain(INTERESTS.intro)
    for (const card of INTERESTS.cards) {
      expect(text).toContain(card.heading.accent)
      for (const paragraph of card.paragraphs) {
        expect(text).toContain(paragraph)
      }
    }
  })

  it('Contact renders the channels and a labelled field per form entry', async () => {
    const wrapper = await mountSuspended(ContactSection)
    const text = wrapper.text()

    expect(text).toContain(CONTACT.intro)
    for (const channel of CONTACT.channels) {
      expect(text).toContain(channel.label)
      expect(text).toContain(channel.value)
    }
    for (const field of CONTACT.form.fields) {
      const control = wrapper.get(`#contact-${field.name}`)
      expect(control.exists()).toBe(true)
      expect(wrapper.html()).toContain(`for="contact-${field.name}"`)
    }
    expect(text).toContain(CONTACT.form.submitLabel)
  })

  it('Footer renders the social links and the current year', async () => {
    const wrapper = await mountSuspended(SiteFooter)

    expect(wrapper.text()).toContain(FOOTER.madeWithPrefix)
    expect(wrapper.text()).toContain(String(new Date().getFullYear()))
    for (const social of FOOTER.socials) {
      expect(wrapper.html()).toContain(`href="${social.href}"`)
    }
  })

  it('Background is a textless, non-interactive layer behind the content', async () => {
    const wrapper = await mountSuspended(SiteBackground)
    const root = wrapper.get('[data-testid="site-background"]')

    expect(root.attributes('aria-hidden')).toBe('true')
    expect(root.classes()).toContain('pointer-events-none')
    expect(root.classes()).toContain('-z-10')
    // Decoration only: a canvas, no text, nothing the keyboard can reach.
    expect(root.find('canvas').exists()).toBe(true)
    expect(root.text()).toBe('')
    expect(root.find('[tabindex]').exists()).toBe(false)
  })
})
