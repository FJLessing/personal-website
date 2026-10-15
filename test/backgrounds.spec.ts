import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createFieldScene } from '../app/utils/backgrounds/fieldScene'
import {
  ACCENT_TEXT,
  BODY_TEXT,
  FIELD_ALPHA_IDLE_LOW,
  FIELD_ALPHA_PEAK,
  FIELD_RING_OVERLAP,
  FIELD_TONE_GAIN,
  FIELD_TONES,
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
 * assert the two things that actually matter for a decorative background:
 * that it draws something, and that a phone does meaningfully less work than a
 * desktop. `npm run bg:cost` prints the same counts with timings.
 */
function stubContext() {
  const calls: Record<string, number> = {}
  const count = (name: string) => {
    calls[name] = (calls[name] ?? 0) + 1
  }
  // Every segment drawn, as [fromX, fromY, toX, toY].
  const segments: number[][] = []
  let from: [number, number] = [0, 0]
  const context = {
    calls,
    segments,
    get drawCalls() {
      return calls.lineTo ?? 0
    },
    clearRect: () => {
      count('clearRect')
      segments.length = 0
    },
    beginPath: () => count('beginPath'),
    moveTo: (x: number, y: number) => {
      count('moveTo')
      from = [x, y]
    },
    lineTo: (x: number, y: number) => {
      count('lineTo')
      segments.push([from[0], from[1], x, y])
    },
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

type Stub = ReturnType<typeof stubContext>

/** Midpoints of the last frame's segments, rounded, sorted. */
function midpoints(ctx: Stub) {
  return ctx.segments
    .map(([ax, ay, bx, by]) => [
      Math.round(((ax! + bx!) / 2) * 10) / 10,
      Math.round(((ay! + by!) / 2) * 10) / 10,
    ])
    .sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!)
}

/** Midpoints that fall inside a box. */
function inBox(
  points: number[][],
  [left, top, right, bottom]: [number, number, number, number],
) {
  return points.filter(
    ([x, y]) => x! >= left && x! <= right && y! >= top && y! <= bottom,
  )
}

/** Runs a scene for `seconds` of simulated time at 30fps; returns the context. */
function run(scene: BackgroundScene, size: SceneSize, seconds: number) {
  const ctx = stubContext()
  const frames = Math.round(seconds * 30)
  for (let i = 0; i < frames; i += 1) scene.draw(ctx, size, 1000 / 30)
  return ctx
}

function laidOut(size: SceneSize) {
  const scene = createFieldScene()
  scene.layout(size)
  return scene
}

const CENTRE_X = DESKTOP.width / 2
const CENTRE_Y = DESKTOP.height / 2
/** A box well inside the ring's hole, and a corner far outside it. */
const NEAR: [number, number, number, number] = [
  CENTRE_X - 40,
  CENTRE_Y - 40,
  CENTRE_X + 40,
  CENTRE_Y + 40,
]
const FAR: [number, number, number, number] = [0, 0, 300, 200]

describe('field scene', () => {
  it('draws something on a desktop viewport', () => {
    expect(averageDrawCalls(createFieldScene(), DESKTOP)).toBeGreaterThan(0)
  })

  it('does substantially less work on a phone viewport', () => {
    const desktop = averageDrawCalls(createFieldScene(), DESKTOP)
    const phone = averageDrawCalls(createFieldScene(), PHONE)
    expect(phone).toBeLessThan(desktop * 0.75)
  })

  it('clears the canvas every frame, so nothing smears', () => {
    const scene = laidOut(DESKTOP)
    const ctx = stubContext()
    for (let i = 0; i < 10; i += 1) scene.draw(ctx, DESKTOP, 40)
    expect(ctx.calls.clearRect).toBe(10)
  })

  it('strokes at most twelve times a frame, ring included', () => {
    const scene = laidOut(DESKTOP)
    scene.pointer?.(CENTRE_X, CENTRE_Y)
    const ctx = run(scene, DESKTOP, 2)
    expect(ctx.calls.stroke! / ctx.calls.clearRect!).toBeLessThanOrEqual(12)
  })

  it('draws a still frame without being handed a time step', () => {
    const scene = laidOut(DESKTOP)
    const ctx = stubContext()
    scene.still(ctx, DESKTOP)
    expect(ctx.drawCalls).toBeGreaterThan(0)
  })

  it('draws the same still frame twice, so nothing advances', () => {
    // `still` is what reduced motion gets instead of the loop. If it moved the
    // clock, a resize under reduced motion would animate one frame at a time.
    // It also ignores the ring and the tilt, so even a scene that has been
    // running with a cursor on it gives the identical idle frame.
    const scene = laidOut(DESKTOP)
    const first = stubContext()
    scene.still(first, DESKTOP)
    scene.pointer?.(CENTRE_X, CENTRE_Y)
    scene.tilt?.(0.8, -0.5)
    run(scene, DESKTOP, 1)
    const second = stubContext()
    scene.still(second, DESKTOP)
    expect(second.segments).toEqual(first.segments)
  })

  it('pushes the dashes near the pointer out, and leaves far ones alone', () => {
    const idle = run(laidOut(DESKTOP), DESKTOP, 1.5)
    const pointed = laidOut(DESKTOP)
    pointed.pointer?.(CENTRE_X, CENTRE_Y)
    const ring = run(pointed, DESKTOP, 1.5)

    // The idle field has dashes in the middle; with the pointer there, the
    // middle is the hole of the ring.
    expect(inBox(midpoints(idle), NEAR).length).toBeGreaterThan(5)
    expect(inBox(midpoints(ring), NEAR).length).toBe(0)
    // Far from the pointer, nothing moved at all.
    expect(inBox(midpoints(idle), FAR).length).toBeGreaterThan(50)
    expect(inBox(midpoints(ring), FAR)).toEqual(inBox(midpoints(idle), FAR))
  })

  it('lets the ring fade and settle once the pointer leaves', () => {
    const control = laidOut(DESKTOP)
    const scene = laidOut(DESKTOP)
    scene.pointer?.(CENTRE_X, CENTRE_Y)
    run(control, DESKTOP, 1)
    run(scene, DESKTOP, 1)

    scene.pointer?.(null, null)
    run(control, DESKTOP, 0.5)
    const fading = run(scene, DESKTOP, 0.5)
    // Half a second on, the hole is filling back in.
    expect(inBox(midpoints(fading), NEAR).length).toBeGreaterThan(0)

    const settledControl = run(control, DESKTOP, 4)
    const settled = run(scene, DESKTOP, 4)
    // And a few seconds on, every spring is back at rest: the frame is the
    // plain idle field again.
    expect(midpoints(settled)).toEqual(midpoints(settledControl))
  })

  it('moves the field with the tilt', () => {
    const level = laidOut(PHONE)
    level.tilt?.(0, 0)
    const tilted = laidOut(PHONE)
    tilted.tilt?.(1, 0)
    const meanX = (ctx: Stub) => {
      const points = midpoints(ctx)
      return points.reduce((sum, [x]) => sum + x!, 0) / points.length
    }
    // Tilting right shifts the whole field right by its parallax.
    expect(meanX(run(tilted, PHONE, 1)) - meanX(run(level, PHONE, 1))).toBeGreaterThan(4) // prettier-ignore
  })

  it('jiggles every dash on a jolt, then settles', () => {
    const control = laidOut(DESKTOP)
    const scene = laidOut(DESKTOP)
    run(control, DESKTOP, 0.5)
    run(scene, DESKTOP, 0.5)
    scene.jolt?.(1)
    const jolted = run(scene, DESKTOP, 0.1)
    const plain = run(control, DESKTOP, 0.1)
    expect(inBox(midpoints(jolted), FAR)).not.toEqual(
      inBox(midpoints(plain), FAR),
    )

    expect(midpoints(run(scene, DESKTOP, 4))).toEqual(
      midpoints(run(control, DESKTOP, 4)),
    )
  })
})

/**
 * The colour budget. A background that nobody can see is as much a defect as
 * one that swamps the text, and both ends are arithmetic, so both are asserted
 * here rather than eyeballed. `npm run bg:contrast` prints the same numbers.
 */
describe('background colour budget', () => {
  const TONE_NAMES = ['amber', 'accent', 'light']

  /**
   * Brightest pixel the background is allowed to put on screen. One dash at
   * the peak, and then the ring overlap: two peak dashes from different
   * buckets crossing, every pairing of tones, stacked as deep as the palette
   * says they can. Dashes in the same bucket share one stroke and so cannot
   * compound.
   */
  const HIGHLIGHTS: Array<[string, Rgb]> = []
  FIELD_TONES.forEach((tone, i) => {
    const peak = FIELD_ALPHA_PEAK * FIELD_TONE_GAIN[i]!
    HIGHLIGHTS.push([`field, ${TONE_NAMES[i]} at the peak`, composite(tone, peak)]) // prettier-ignore
    FIELD_TONES.forEach((over, j) => {
      let colour = composite(tone, peak)
      for (let k = 1; k < FIELD_RING_OVERLAP; k += 1) {
        colour = composite(over, FIELD_ALPHA_PEAK * FIELD_TONE_GAIN[j]!, colour)
      }
      HIGHLIGHTS.push([`field, ring overlap ${TONE_NAMES[j]} on ${TONE_NAMES[i]}`, colour]) // prettier-ignore
    })
  })

  /** Faintest mark it draws, which still has to be visible. */
  const FAINTEST: Array<[string, Rgb]> = FIELD_TONES.map((tone, i) => [
    `field, ${TONE_NAMES[i]} at the idle low`,
    composite(tone, FIELD_ALPHA_IDLE_LOW * FIELD_TONE_GAIN[i]!),
  ])

  it('budgets for at least two dashes overlapping on the ring', () => {
    expect(FIELD_RING_OVERLAP).toBeGreaterThanOrEqual(2)
  })

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
    // silently so, which is exactly how the first round ended up invisible.
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
