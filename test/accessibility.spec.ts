import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'

import SiteNavigation from '~/components/SiteNavigation.vue'
import { NAVIGATION } from '~/content/site'
import { contrastRatio } from '~/utils/backgrounds/palette'
import { colour } from './support/tailwind-palette'

/** WCAG 2.1 AA for normal-sized text. */
const AA_NORMAL_TEXT = 4.5

/**
 * Every opaque surface the page paints text on. `bg-zinc-800` is the lightest
 * of them, so it is the worst case for a light-grey foreground.
 */
const SURFACES = ['black', 'zinc-800', 'zinc-900', 'zinc-950'] as const

const APP = resolve(process.cwd(), 'app')

const templates = readdirSync(APP, { recursive: true, encoding: 'utf8' })
  .filter((entry) => entry.endsWith('.vue'))
  .map((entry) => readFileSync(`${APP}/${entry}`, 'utf8'))

const greyTextUtilities = [
  ...new Set(
    templates.flatMap((source) => source.match(/text-zinc-\d+/g) ?? []),
  ),
].sort()

/**
 * The contrast check is computed, not a blacklist: it resolves the real
 * Tailwind token and measures it. `text-zinc-500` shipped at 3.67:1 on
 * `bg-zinc-900` and failed Lighthouse, and a swap to any other too-dark step
 * would fail here the same way.
 */
describe('text contrast', () => {
  it('finds the grey text utilities to check', () => {
    expect(greyTextUtilities.length).toBeGreaterThan(0)
  })

  it.each(greyTextUtilities)('%s clears AA on every surface', (utility) => {
    const text = colour(utility.replace('text-', ''))

    for (const surface of SURFACES) {
      const ratio = contrastRatio(text, colour(surface))
      expect(
        ratio,
        `${utility} on bg-${surface} is ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
    }
  })

  it('still rejects the step that failed the audit', () => {
    // Guards the threshold itself: if this ever passes, the check above has
    // stopped measuring anything.
    expect(contrastRatio(colour('zinc-500'), colour('zinc-900'))).toBeLessThan(
      AA_NORMAL_TEXT,
    )
  })
})

/**
 * WCAG 2.5.3 Label in Name: an accessible name has to contain the visible
 * label, or speech input cannot activate the control by what it says. The
 * brand is two adjacent spans, so what a user reads out is `FJLessing`.
 */
describe('label in name', () => {
  it('the brand link accessible name contains its visible text', async () => {
    const wrapper = await mountSuspended(SiteNavigation)
    const brand = wrapper.get('a[aria-label]')

    const visible = brand.text().replace(/\s+/g, '')
    const accessibleName = brand.attributes('aria-label') ?? ''

    expect(visible).toBe(`${NAVIGATION.brandLead}${NAVIGATION.brandAccent}`)
    expect(accessibleName.toLowerCase()).toContain(visible.toLowerCase())
  })
})
