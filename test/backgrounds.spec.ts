import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createContourScene } from '../app/utils/backgrounds/contourScene'
import {
  ACCENT,
  ACCENT_TEXT,
  BODY_TEXT,
  CONTOUR_ALPHA_HIGH,
  CONTOUR_ALPHA_LOW,
  MAX_HIGHLIGHT_LUMINANCE,
  MIN_VISIBLE_CONTRAST,
  PAGE_BASE,
  composite,
  contrastRatio,
  relativeLuminance,
} from '../app/utils/backgrounds/palette'
import type { Rgb } from '../app/utils/backgrounds/palette'
import type { BackgroundScene, SceneSize } from '../app/utils/backgrounds/scene'

/**
 * The scene is a plain module that only ever touches a 2D context, which is the
 * whole point of the `BackgroundScene` contract: a counting stub is enough to
 * assert the two things that actually matter for a decorative background —
 * that it draws something, and that a phone does meaningfully less work than a
 * desktop. `npm run bg:cost` prints the same counts with timings.
 */
function stubContext() {
  const calls: Record<string, number> = {}
  const count = (name: string) => {
    calls[name] = (calls[name] ?? 0) + 1
  }
  const context = {
    calls,
    get drawCalls() {
      return calls.lineTo ?? 0
    },
    clearRect: () => count('clearRect'),
    beginPath: () => count('beginPath'),
    moveTo: () => count('moveTo'),
    lineTo: () => count('lineTo'),
    stroke: () => count('stroke'),
    setTransform: () => count('setTransform'),
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
  }
  return context as typeof context & CanvasRenderingContext2D
}

const DESKTOP: SceneSize = { width: 1440, height: 900, dpr: 2, small: false }
const PHONE: SceneSize = { width: 360, height: 740, dpr: 1.5, small: true }

/** Average draw calls per frame over a few seconds of simulated time. */
function averageDrawCalls(scene: BackgroundScene, size: SceneSize) {
  scene.layout(size)
  const ctx = stubContext()
  const frames = 90
  for (let i = 0; i < frames; i += 1) scene.draw(ctx, size, 1000 / 24)
  return ctx.drawCalls / frames
}

describe('contour scene', () => {
  it('draws something on a desktop viewport', () => {
    expect(averageDrawCalls(createContourScene(), DESKTOP)).toBeGreaterThan(0)
  })

  it('does substantially less work on a phone viewport', () => {
    const desktop = averageDrawCalls(createContourScene(), DESKTOP)
    const phone = averageDrawCalls(createContourScene(), PHONE)
    expect(phone).toBeLessThan(desktop * 0.75)
  })

  it('clears the canvas every frame, so nothing smears', () => {
    const scene = createContourScene()
    scene.layout(DESKTOP)
    const ctx = stubContext()
    for (let i = 0; i < 10; i += 1) scene.draw(ctx, DESKTOP, 40)
    expect(ctx.calls.clearRect).toBe(10)
  })

  it('draws a still frame without being handed a time step', () => {
    const scene = createContourScene()
    scene.layout(DESKTOP)
    const ctx = stubContext()
    scene.still(ctx, DESKTOP)
    expect(ctx.drawCalls).toBeGreaterThan(0)
  })

  it('draws the same still frame twice, so nothing advances', () => {
    // `still` is what reduced motion gets instead of the loop. If it moved the
    // clock, a resize under reduced motion would animate one frame at a time.
    const scene = createContourScene()
    scene.layout(DESKTOP)
    const first = stubContext()
    scene.still(first, DESKTOP)
    const second = stubContext()
    scene.still(second, DESKTOP)
    expect(second.drawCalls).toBe(first.drawCalls)
  })
})

/**
 * The colour budget. A background that nobody can see is as much a defect as
 * one that swamps the text, and both ends are arithmetic, so both are asserted
 * here rather than eyeballed. `npm run bg:contrast` prints the same numbers.
 */
describe('background colour budget', () => {
  /** Brightest pixel the background is allowed to put on screen. */
  const HIGHLIGHTS: Array<[string, Rgb]> = [
    ['contour, highest isoline', composite(ACCENT, CONTOUR_ALPHA_HIGH)],
  ]

  /** Faintest mark it draws, which still has to be visible. */
  const FAINTEST: Array<[string, Rgb]> = [
    ['contour, lowest isoline', composite(ACCENT, CONTOUR_ALPHA_LOW)],
  ]

  it.each(FAINTEST)('%s is bright enough to see', (_label, colour) => {
    expect(contrastRatio(colour, PAGE_BASE)).toBeGreaterThanOrEqual(
      MIN_VISIBLE_CONTRAST,
    )
  })

  it.each(HIGHLIGHTS)('%s stays inside the budget', (_label, colour) => {
    expect(relativeLuminance(colour)).toBeLessThanOrEqual(
      MAX_HIGHLIGHT_LUMINANCE,
    )
  })

  it.each(HIGHLIGHTS)('%s keeps body text at WCAG AA', (_label, colour) => {
    expect(contrastRatio(BODY_TEXT, colour)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(HIGHLIGHTS)('%s keeps accent text at WCAG AA', (_label, colour) => {
    // yellow-500 on amber is the tightest pairing on the page, and it is used
    // at 14px, so it needs the full 4.5:1 rather than the large-text 3:1.
    expect(contrastRatio(ACCENT_TEXT, colour)).toBeGreaterThanOrEqual(4.5)
  })

  it('composites against the backdrop the page actually paints', () => {
    // The whole budget is arithmetic over one assumed base colour. If app.vue
    // changes that colour and nothing else, every number above is wrong, and
    // silently so — which is exactly how the first round ended up invisible.
    // `import.meta.url` is not a file URL under the happy-dom environment, so
    // resolve from the Vitest root instead.
    const appVue = readFileSync(resolve(process.cwd(), 'app/app.vue'), 'utf8')
    const hex = PAGE_BASE.map((c) => c.toString(16).padStart(2, '0')).join('')
    expect(appVue).toContain(`bg-[#${hex}]`)
    // And it has to form a stacking context, or its own background paints on
    // top of the -z-10 layer and dims the whole thing.
    expect(appVue).toContain('isolate')
  })
})
