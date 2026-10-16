import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createWaveScene } from '../app/utils/backgrounds/waveScene'
import {
  ACCENT_TEXT,
  BODY_TEXT,
  MAX_HIGHLIGHT_LUMINANCE,
  MIN_VISIBLE_CONTRAST,
  PAGE_BASE,
  WAVE_ALPHA_FAINT,
  WAVE_ALPHA_PEAK,
  WAVE_MAX_RADIUS,
  WAVE_MIN_SPACING,
  WAVE_TONE_GAIN,
  WAVE_TONES,
  composite,
  contrastRatio,
  relativeLuminance,
} from '../app/utils/backgrounds/palette'
import type { Rgb } from '../app/utils/backgrounds/palette'
import type { BackgroundScene, SceneSize } from '../app/utils/backgrounds/scene'

/**
 * The scene is a plain module that only ever touches a 2D context, which is the
 * whole point of the `BackgroundScene` contract: a recording stub is enough to
 * assert what matters for a decorative background: that it draws something,
 * where it draws it, and that a phone does meaningfully less work than a
 * desktop. `npm run bg:cost` prints the same counts with timings.
 */
function stubContext() {
  const calls: Record<string, number> = {}
  const count = (name: string) => {
    calls[name] = (calls[name] ?? 0) + 1
  }
  // Every dot drawn in the last frame, as [x, y, radius].
  const dots: number[][] = []
  const context = {
    calls,
    dots,
    get drawCalls() {
      return (calls.rect ?? 0) + (calls.arc ?? 0)
    },
    clearRect: () => {
      count('clearRect')
      dots.length = 0
    },
    beginPath: () => count('beginPath'),
    moveTo: () => count('moveTo'),
    rect: (x: number, y: number, w: number) => {
      count('rect')
      dots.push([x + w / 2, y + w / 2, w / 2])
    },
    arc: (x: number, y: number, r: number) => {
      count('arc')
      dots.push([x, y, r])
    },
    fill: () => count('fill'),
    setTransform: () => count('setTransform'),
    fillStyle: '',
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

/** Runs a scene for `seconds` of simulated time at 30fps; returns the context. */
function run(scene: BackgroundScene, size: SceneSize, seconds: number) {
  const ctx = stubContext()
  const frames = Math.round(seconds * 30)
  for (let i = 0; i < frames; i += 1) scene.draw(ctx, size, 1000 / 30)
  return ctx
}

function laidOut(size: SceneSize) {
  const scene = createWaveScene()
  scene.layout(size)
  return scene
}

/** Dots, rounded and sorted, so two frames compare as values. */
function positions(ctx: Stub) {
  return ctx.dots
    .map(([x, y, r]) => [
      Math.round(x! * 10) / 10,
      Math.round(y! * 10) / 10,
      Math.round(r! * 100) / 100,
    ])
    .sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!)
}

/** Dots whose centre falls inside a box. */
function inBox(
  dots: number[][],
  [left, top, right, bottom]: [number, number, number, number],
) {
  return dots.filter(
    ([x, y]) => x! >= left && x! <= right && y! >= top && y! <= bottom,
  )
}

/** Mean of one coordinate. */
const mean = (dots: number[][], axis: number) =>
  dots.reduce((sum, dot) => sum + dot[axis]!, 0) / dots.length

/** The y of the highest dot in a vertical strip, i.e. the horizon there. */
function topIn(dots: number[][], left: number, right: number) {
  return Math.min(
    ...dots.filter(([x]) => x! >= left && x! <= right).map(([, y]) => y!),
  )
}

/** Mean absolute move between two frames' dots, matched by draw order. */
function meanMove(a: Stub, b: Stub) {
  const n = Math.min(a.dots.length, b.dots.length)
  let sum = 0
  for (let i = 0; i < n; i += 1) {
    sum += Math.hypot(a.dots[i]![0]! - b.dots[i]![0]!, a.dots[i]![1]! - b.dots[i]![1]!) // prettier-ignore
  }
  return sum / n
}

describe('wave scene', () => {
  it('draws something on a desktop viewport', () => {
    expect(averageDrawCalls(createWaveScene(), DESKTOP)).toBeGreaterThan(1000)
  })

  it('does substantially less work on a phone viewport', () => {
    const desktop = averageDrawCalls(createWaveScene(), DESKTOP)
    const phone = averageDrawCalls(createWaveScene(), PHONE)
    expect(phone).toBeLessThan(desktop * 0.75)
  })

  it('clears the canvas every frame, so nothing smears', () => {
    const scene = laidOut(DESKTOP)
    const ctx = stubContext()
    for (let i = 0; i < 10; i += 1) scene.draw(ctx, DESKTOP, 40)
    expect(ctx.calls.clearRect).toBe(10)
  })

  it('fills at most twelve times a frame, dent and ripples included', () => {
    const scene = laidOut(DESKTOP)
    const ctx = stubContext()
    for (let i = 0; i < 60; i += 1) {
      scene.pointer?.(200 + i * 18, 650)
      scene.draw(ctx, DESKTOP, 1000 / 30)
    }
    expect(ctx.calls.fill! / ctx.calls.clearRect!).toBeLessThanOrEqual(12)
    expect(ctx.calls.stroke).toBeUndefined()
  })

  it('draws a still frame without being handed a time step', () => {
    const scene = laidOut(DESKTOP)
    const ctx = stubContext()
    scene.still(ctx, DESKTOP)
    expect(ctx.drawCalls).toBeGreaterThan(1000)
  })

  it('draws the same still frame twice, so nothing advances', () => {
    // `still` is what reduced motion gets instead of the loop. If it moved the
    // clock, a resize under reduced motion would animate one frame at a time.
    // It also ignores the dent, the ripples and the tilt, so even a scene that
    // has been running with a cursor on it gives the identical frame.
    const scene = laidOut(DESKTOP)
    const first = stubContext()
    scene.still(first, DESKTOP)
    scene.tilt?.(0.8, -0.5)
    for (let i = 0; i < 20; i += 1) {
      scene.pointer?.(300 + i * 50, 700)
      scene.draw(stubContext(), DESKTOP, 1000 / 30)
    }
    scene.jolt?.(1)
    const second = stubContext()
    scene.still(second, DESKTOP)
    expect(second.dots).toEqual(first.dots)
  })

  it('keeps the swells rolling with no input at all', () => {
    const scene = laidOut(DESKTOP)
    const before = run(scene, DESKTOP, 0.1)
    const after = run(scene, DESKTOP, 1)
    expect(meanMove(before, after)).toBeGreaterThan(0.5)
  })

  it.each([
    ['desktop', DESKTOP],
    ['phone', PHONE],
  ] as const)(
    'draws nothing in the top third on a %s, level',
    (_name, size) => {
      const scene = laidOut(size)
      const still = stubContext()
      scene.still(still, size)
      const live = run(scene, size, 2)
      for (const ctx of [still, live]) {
        expect(inBox(ctx.dots, [-10, -10, size.width + 10, size.height * 0.3])).toEqual([]) // prettier-ignore
        // And the water does reach up to the horizon, not stop short of it.
        expect(topIn(ctx.dots, 0, size.width)).toBeLessThan(size.height * 0.36)
      }
    },
  )

  it('draws near rows with bigger dots than far rows', () => {
    const scene = laidOut(DESKTOP)
    const ctx = stubContext()
    scene.still(ctx, DESKTOP)
    const far = inBox(ctx.dots, [0, 0, DESKTOP.width, DESKTOP.height * 0.45])
    const near = inBox(ctx.dots, [0, DESKTOP.height * 0.85, DESKTOP.width, DESKTOP.height]) // prettier-ignore
    expect(far.length).toBeGreaterThan(100)
    expect(near.length).toBeGreaterThan(100)
    expect(mean(near, 2)).toBeGreaterThan(mean(far, 2) * 1.8)
    expect(Math.max(...ctx.dots.map(([, , r]) => r!))).toBeLessThanOrEqual(WAVE_MAX_RADIUS) // prettier-ignore
  })

  it('keeps dots apart, so no two can stack into a brighter pixel', () => {
    // The colour budget assumes the brightest pixel is one dot. At rest, every
    // dot centre is at least two of the largest radii from its neighbours.
    for (const size of [DESKTOP, PHONE]) {
      const scene = laidOut(size)
      const ctx = stubContext()
      scene.still(ctx, size)
      const near = inBox(ctx.dots, [0, size.height * 0.8, size.width, size.height]) // prettier-ignore
      let closest = Infinity
      for (let i = 0; i < near.length; i += 1) {
        for (let j = i + 1; j < near.length; j += 1) {
          const gap = Math.hypot(near[i]![0]! - near[j]![0]!, near[i]![1]! - near[j]![1]!) // prettier-ignore
          if (gap < closest) closest = gap
        }
      }
      expect(closest).toBeGreaterThanOrEqual(WAVE_MIN_SPACING)
    }
  })

  it('dents the surface under the pointer, and leaves far dots alone', () => {
    const idle = laidOut(DESKTOP)
    const pointed = laidOut(DESKTOP)
    // Parked, so it dents but does not ripple.
    pointed.pointer?.(720, 700)
    const a = run(idle, DESKTOP, 1)
    const b = run(pointed, DESKTOP, 1)
    const under: [number, number, number, number] = [660, 640, 780, 760]
    const corner: [number, number, number, number] = [0, 300, 300, 450]
    // Under the pointer the dots moved...
    expect(inBox(positions(b), under)).not.toEqual(inBox(positions(a), under))
    // ...and parted: fewer centres right under the cursor.
    expect(inBox(b.dots, [700, 680, 740, 720]).length).toBeLessThan(
      inBox(a.dots, [700, 680, 740, 720]).length,
    )
    // Far from it, nothing moved at all.
    expect(inBox(positions(a), corner).length).toBeGreaterThan(50)
    expect(inBox(positions(b), corner)).toEqual(inBox(positions(a), corner))
  })

  it('drops a ripple as the pointer moves, which spreads and dies out', () => {
    const control = laidOut(DESKTOP)
    const scene = laidOut(DESKTOP)
    // A sweep across the lower half, then the pointer leaves.
    for (let i = 0; i < 10; i += 1) {
      scene.pointer?.(400 + i * 60, 700)
      scene.draw(stubContext(), DESKTOP, 1000 / 30)
      control.draw(stubContext(), DESKTOP, 1000 / 30)
    }
    scene.pointer?.(null, null)
    // Half a second on, the dent has gone but the ripples are still out.
    const rippling = run(scene, DESKTOP, 0.5)
    const plain = run(control, DESKTOP, 0.5)
    expect(meanMove(rippling, plain)).toBeGreaterThan(0.05)
    // A few seconds on, they have died out: the plain wave again.
    expect(positions(run(scene, DESKTOP, 3))).toEqual(
      positions(run(control, DESKTOP, 3)),
    )
  })

  it('rolls the horizon and moves it up and down with the tilt', () => {
    const level = laidOut(PHONE)
    level.tilt?.(0, 0)
    const rolled = laidOut(PHONE)
    rolled.tilt?.(1, 0)
    const pitched = laidOut(PHONE)
    pitched.tilt?.(0, 1)
    const flat = run(level, PHONE, 1.5)
    const roll = run(rolled, PHONE, 1.5)
    const pitch = run(pitched, PHONE, 1.5)

    const slope = (ctx: Stub) =>
      topIn(ctx.dots, PHONE.width - 60, PHONE.width) - topIn(ctx.dots, 0, 60)
    // Level, the horizon is flat to within the sway; rolled right, it turns
    // the other way on screen, by most of 8 degrees across the width.
    expect(Math.abs(slope(flat))).toBeLessThan(15)
    expect(slope(roll)).toBeLessThan(-PHONE.width * Math.tan((5 * Math.PI) / 180)) // prettier-ignore
    // Pitched, it moves down by most of 8% of the height.
    const middle = (ctx: Stub) => topIn(ctx.dots, PHONE.width / 2 - 30, PHONE.width / 2 + 30) // prettier-ignore
    expect(middle(pitch) - middle(flat)).toBeGreaterThan(PHONE.height * 0.05)
  })

  it('sways on a handheld with no reading, and stops when it is no longer one', () => {
    const scene = laidOut(PHONE)
    scene.tilt?.(null, null)
    run(scene, PHONE, 3)
    const a = run(scene, PHONE, 0.1)
    const swaying = topIn(a.dots, 0, 60) - topIn(a.dots, PHONE.width - 60, PHONE.width) // prettier-ignore
    expect(Math.abs(swaying)).toBeGreaterThan(1)

    scene.tilt?.(null, null, false)
    run(scene, PHONE, 3)
    const b = run(scene, PHONE, 0.1)
    const settled = topIn(b.dots, 0, 60) - topIn(b.dots, PHONE.width - 60, PHONE.width) // prettier-ignore
    expect(Math.abs(settled)).toBeLessThan(Math.abs(swaying))
    expect(Math.abs(settled)).toBeLessThan(6)
  })

  it('drops a ripple on a jolt, then settles', () => {
    const control = laidOut(PHONE)
    const scene = laidOut(PHONE)
    run(control, PHONE, 0.5)
    run(scene, PHONE, 0.5)
    scene.jolt?.(1)
    expect(meanMove(run(scene, PHONE, 0.4), run(control, PHONE, 0.4))).toBeGreaterThan(0.05) // prettier-ignore
    expect(positions(run(scene, PHONE, 3))).toEqual(
      positions(run(control, PHONE, 3)),
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
   * Brightest pixel the background is allowed to put on screen: one near-row
   * dot at the peak. Dots in the same bucket share one fill and cannot
   * compound, and the spacing test above keeps dots from two buckets apart.
   */
  const HIGHLIGHTS: Array<[string, Rgb]> = WAVE_TONES.map((tone, i) => [
    `wave, ${TONE_NAMES[i]} near-row dot at the peak`,
    composite(tone, WAVE_ALPHA_PEAK * WAVE_TONE_GAIN[i]!),
  ])

  /** Faintest mark it draws, which still has to be visible. */
  const FAINTEST: Array<[string, Rgb]> = WAVE_TONES.map((tone, i) => [
    `wave, ${TONE_NAMES[i]} at the horizon`,
    composite(tone, WAVE_ALPHA_FAINT * WAVE_TONE_GAIN[i]!),
  ])

  it('keeps the dot spacing at two of the largest radii', () => {
    expect(WAVE_MIN_SPACING).toBeGreaterThanOrEqual(2 * WAVE_MAX_RADIUS)
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
