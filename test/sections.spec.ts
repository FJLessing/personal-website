import { describe, expect, it, vi } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody, setResponseStatus } from 'h3'

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
    // Literal paths, not HERO.portrait.*: the test must fail if the content
    // module points the hero back at the full-size /profile.png.
    const sources = wrapper.findAll('picture source')
    expect(
      sources.map((s) => [s.attributes('type'), s.attributes('srcset')]),
    ).toEqual([
      ['image/avif', '/profile-512.avif'],
      ['image/webp', '/profile-512.webp'],
    ])
    expect(wrapper.get('picture img').attributes('src')).toBe(
      '/profile-512.png',
    )
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

  it('Contact renders every channel as a working link', async () => {
    const wrapper = await mountSuspended(ContactSection)
    const text = wrapper.text()

    expect(text).toContain(CONTACT.intro)
    for (const channel of CONTACT.channels) {
      expect(text).toContain(channel.label)
      expect(text).toContain(channel.value)
      expect(wrapper.html()).toContain(`href="${channel.href}"`)
    }
  })

  /**
   * The form came out once because it posted to an endpoint that did not
   * exist. Without a webhook the endpoint can only fail, so no form.
   */
  it('Contact ships no form when no Slack webhook is configured', async () => {
    useState('contact-form-enabled').value = false
    const wrapper = await mountSuspended(ContactSection)

    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.find('textarea').exists()).toBe(false)
  })

  it('Contact renders a labelled field per form entry when enabled', async () => {
    useState('contact-form-enabled').value = true
    const wrapper = await mountSuspended(ContactSection)

    for (const field of CONTACT.form.fields) {
      const control = wrapper.get(`#contact-${field.name}`)
      expect(control.attributes('maxlength')).toBe(String(field.maxLength))
      expect(control.attributes('autocomplete')).toBe(field.autocomplete)
      expect(wrapper.html()).toContain(`for="contact-${field.name}"`)
    }
    expect(wrapper.get('#contact-name').attributes('autocomplete')).toBe('name')
    expect(wrapper.get('#contact-email').attributes('autocomplete')).toBe(
      'email',
    )
    expect(wrapper.text()).toContain(CONTACT.form.submitLabel)
    expect(wrapper.text()).toContain(CONTACT.form.privacyNote)

    // The honeypot is out of the tab order and hidden from assistive tech.
    const honeypot = wrapper.get('#contact-website')
    expect(honeypot.attributes('tabindex')).toBe('-1')
    expect(honeypot.element.closest('[aria-hidden="true"]')).not.toBeNull()

    useState('contact-form-enabled').value = false
  })

  it('Contact posts the fields to /api/contact and shows the result', async () => {
    const received: unknown[] = []
    registerEndpoint('/api/contact', {
      method: 'POST',
      handler: async (event) => {
        received.push(await readBody(event))
        return { ok: true }
      },
    })
    useState('contact-form-enabled').value = true
    const wrapper = await mountSuspended(ContactSection)

    await wrapper.get('#contact-name').setValue('Ada')
    await wrapper.get('#contact-email').setValue('ada@example.com')
    await wrapper.get('#contact-message').setValue('Hello')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() =>
      expect(wrapper.text()).toContain(CONTACT.form.successMessage),
    )

    expect(received).toEqual([
      { name: 'Ada', email: 'ada@example.com', message: 'Hello', website: '' },
    ])

    useState('contact-form-enabled').value = false
  })

  it('Contact tells the visitor to wait when the server answers 429', async () => {
    registerEndpoint('/api/contact', {
      method: 'POST',
      handler: (event) => {
        setResponseStatus(event, 429)
        return { ok: false, error: 'Message not sent' }
      },
    })
    useState('contact-form-enabled').value = true
    const wrapper = await mountSuspended(ContactSection)

    await wrapper.get('#contact-name').setValue('Ada')
    await wrapper.get('#contact-email').setValue('ada@example.com')
    await wrapper.get('#contact-message').setValue('Hello')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() =>
      expect(wrapper.text()).toContain(CONTACT.form.rateLimitedMessage),
    )
    expect(wrapper.text()).not.toContain(CONTACT.form.errorMessage)

    useState('contact-form-enabled').value = false
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
