import { describe, expect, it } from 'vitest'
import { createContourScene } from '../app/utils/backgrounds/contourScene'
import { createGlyphScene } from '../app/utils/backgrounds/glyphScene'
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
