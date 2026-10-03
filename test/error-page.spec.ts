import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'

import ErrorPage from '~/error.vue'
import SiteNavigation from '~/components/SiteNavigation.vue'
import { ERROR, NAVIGATION } from '~/content/site'

const mountError = (statusCode: number) =>
  mountSuspended(ErrorPage, {
    props: { error: { statusCode, message: 'raw internal detail' } },
  })

/**
 * The error page renders outside `app.vue`, so nothing about it is covered by
 * the home-page tests. These assert the two things that actually broke: that
 * it carries the site's chrome, and that the copy matches the status.
 */
describe('error page', () => {
  it('uses the not-found copy for a 404', async () => {
    const wrapper = await mountError(404)
    const text = wrapper.text()

    expect(text).toContain(`${ERROR.codePrefix} 404`)
    expect(text).toContain(ERROR.notFound.heading.accent)
    expect(text).toContain(ERROR.notFound.message)
  })

  it('uses the server-error copy for a 5xx', async () => {
    const text = (await mountError(503)).text()

    expect(text).toContain(ERROR.serverError.heading.accent)
    expect(text).not.toContain(ERROR.notFound.message)
  })

  it('falls back for a 4xx that is not a 404', async () => {
    const text = (await mountError(403)).text()

    expect(text).toContain(ERROR.fallback.heading.accent)
  })

  it('carries the site chrome: background, nav, footer, skip link', async () => {
    const wrapper = await mountError(404)
    const html = wrapper.html()

    expect(wrapper.find('[data-testid="site-background"]').exists()).toBe(true)
    expect(wrapper.find('nav').exists()).toBe(true)
    expect(wrapper.find('footer').exists()).toBe(true)
    expect(wrapper.find('main#main').exists()).toBe(true)
    expect(html).toContain('href="#main"')
    expect(wrapper.find('[data-testid="error-page"]').exists()).toBe(true)
    // The opaque backdrop is what stops the page rendering as black-on-white.
    expect(html).toContain('bg-[#0d0d0d]')
  })

  it('offers a way back that works without JavaScript', async () => {
    const html = (await mountError(404)).html()

    expect(html).toContain(`href="${ERROR.homeHref}"`)
    expect(html).toContain(`href="${ERROR.contactHref}"`)
  })

  it('rewrites the nav hash links to the home route', async () => {
    const html = (await mountError(404)).html()

    for (const link of NAVIGATION.links) {
      expect(html).toContain(`href="/${link.href}"`)
    }
  })

  it('leaves the nav links untouched when no base is given', async () => {
    const html = (await mountSuspended(SiteNavigation)).html()

    for (const link of NAVIGATION.links) {
      expect(html).toContain(`href="${link.href}"`)
    }
    expect(html).toContain('href="#"')
  })
})
