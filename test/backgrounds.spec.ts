import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createContourScene } from '../app/utils/backgrounds/contourScene'
import { createGlyphScene } from '../app/utils/backgrounds/glyphScene'
import {
  ACCENT,
  ACCENT_HOT,
  ACCENT_TEXT,
  ACCENT_WARM,
  AURORA_ALPHA_ONE,
  AURORA_ALPHA_THREE,
  AURORA_ALPHA_TWO,
  AURORA_GRAIN_ALPHA,
  BODY_TEXT,
  CONTOUR_ALPHA_HIGH,
  CONTOUR_ALPHA_LOW,
  GLYPH_ALPHA_HOT,
  GLYPH_ALPHA_PEAK,
  GLYPH_STILL_ALPHA_HIGH,
  GLYPH_STILL_ALPHA_LOW,
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
 * Scenes are plain modules that only ever touch a 2D context, which is the
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
      return (calls.lineTo ?? 0) + (calls.fillText ?? 0)
    },
    clearRect: () => count('clearRect'),
    beginPath: () => count('beginPath'),
    moveTo: () => count('moveTo'),
    lineTo: () => count('lineTo'),
    stroke: () => count('stroke'),
    fillText: () => count('fillText'),
    setTransform: () => count('setTransform'),
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
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

describe.each([
  ['contour', createContourScene],
  ['glyphs', createGlyphScene],
])('%s scene', (_name, create) => {
  it('draws something on a desktop viewport', () => {
    expect(averageDrawCalls(create(), DESKTOP)).toBeGreaterThan(0)
  })

  it('does substantially less work on a phone viewport', () => {
    const desktop = averageDrawCalls(create(), DESKTOP)
    const phone = averageDrawCalls(create(), PHONE)
    expect(phone).toBeLessThan(desktop * 0.75)
  })

  it('clears the canvas every frame, so nothing smears', () => {
    const scene = create()
    scene.layout(DESKTOP)
    const ctx = stubContext()
    for (let i = 0; i < 10; i += 1) scene.draw(ctx, DESKTOP, 40)
    expect(ctx.calls.clearRect).toBe(10)
  })

  it('draws a still frame without being handed a time step', () => {
    const scene = create()
    scene.layout(DESKTOP)
    const ctx = stubContext()
    scene.still(ctx, DESKTOP)
    expect(ctx.drawCalls).toBeGreaterThan(0)
  })
})

/**
 * The colour budget. A background that nobody can see is as much a defect as
 * one that swamps the text, and both ends are arithmetic, so both are asserted
 * here rather than eyeballed. `npm run bg:contrast` prints the same numbers.
 */
describe('background colour budget', () => {
  /** Brightest pixel each layer is allowed to put on screen. */
  const HIGHLIGHTS: Array<[string, Rgb]> = [
    ['contour, highest isoline', composite(ACCENT, CONTOUR_ALPHA_HIGH)],
    ['glyphs, glyph at full power', composite(ACCENT, GLYPH_ALPHA_PEAK)],
    ['glyphs, glyph under the cursor', composite(ACCENT_HOT, GLYPH_ALPHA_HOT)],
    ['glyphs, still frame', composite(ACCENT, GLYPH_STILL_ALPHA_HIGH)],
    [
      // Corner-anchored, but they do overlap, so the stack is the real worst
      // case rather than any single gradient.
      'aurora, all three gradients stacked',
      composite(
        ACCENT_HOT,
        AURORA_ALPHA_THREE,
        composite(
          ACCENT_WARM,
          AURORA_ALPHA_TWO,
          composite(ACCENT, AURORA_ALPHA_ONE),
        ),
      ),
    ],
  ]

  /** Faintest mark each layer draws, which still has to be visible. */
  const FAINTEST: Array<[string, Rgb]> = [
    ['contour, lowest isoline', composite(ACCENT, CONTOUR_ALPHA_LOW)],
    ['glyphs, still frame', composite(ACCENT, GLYPH_STILL_ALPHA_LOW)],
    ['aurora, dot grid', composite([255, 255, 255], AURORA_GRAIN_ALPHA)],
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
