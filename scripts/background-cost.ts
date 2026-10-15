/**
 * Prints the per-frame cost of the background scene at the two viewports the
 * brief asks about. Run with `npm run bg:cost`.
 *
 * What this measures: the JavaScript the scene runs per frame, and the number
 * of segments and `stroke()` calls it hands the canvas, with the cursor
 * parked in the middle so the ring (the expensive part) is always on. On the
 * phone viewport the tilt hook is driven instead, which also switches on the
 * handheld wander. What it does not measure: GPU
 * rasterisation of those calls, which needs a real browser. Draw-call count is
 * the honest proxy for that half, and it is the half we control.
 */
import { performance } from 'node:perf_hooks'
import { createFieldScene } from '../app/utils/backgrounds/fieldScene'
import type { SceneSize } from '../app/utils/backgrounds/scene'

const VIEWPORTS: Array<{ label: string; size: SceneSize; fps: number }> = [
  {
    label: '  360x740 (phone)',
    size: { width: 360, height: 740, dpr: 1.5, small: true },
    fps: 24,
  },
  {
    label: '1440x900 (desktop)',
    size: { width: 1440, height: 900, dpr: 2, small: false },
    fps: 30,
  },
]

function stubContext() {
  let lineTo = 0
  let strokes = 0
  return {
    get drawCalls() {
      return lineTo
    },
    get strokes() {
      return strokes
    },
    clearRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {
      lineTo += 1
    },
    stroke: () => {
      strokes += 1
    },
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt' as CanvasLineCap,
  }
}

const FRAMES = 600
/** Budget from the FTR-34 plan: ms of scene JavaScript per frame, in Node. */
const DESKTOP_MS = 2
const PHONE_MS = 1
const MAX_STROKES = 12

let failures = 0
for (const viewport of VIEWPORTS) {
  const scene = createFieldScene()
  scene.layout(viewport.size)
  const { width, height, small } = viewport.size
  if (small) scene.tilt?.(0.4, -0.3)
  else scene.pointer?.(width / 2, height / 2)
  const ctx = stubContext() as unknown as CanvasRenderingContext2D & {
    drawCalls: number
    strokes: number
  }
  const step = 1000 / viewport.fps

  // Warm the JIT before timing.
  for (let i = 0; i < 60; i += 1) scene.draw(ctx, viewport.size, step)

  const before = ctx.drawCalls
  const strokesBefore = ctx.strokes
  const started = performance.now()
  for (let i = 0; i < FRAMES; i += 1) scene.draw(ctx, viewport.size, step)
  const perFrame = (performance.now() - started) / FRAMES
  const calls = (ctx.drawCalls - before) / FRAMES
  const strokes = (ctx.strokes - strokesBefore) / FRAMES

  const limit = small ? PHONE_MS : DESKTOP_MS
  const over = perFrame > limit || strokes > MAX_STROKES
  if (over) failures += 1
  const budget = (perFrame / step) * 100
  console.log(
    `field  ${viewport.label}  @${String(viewport.fps).padStart(2)}fps  ` +
      `${perFrame.toFixed(3)} ms/frame (limit ${limit})  ` +
      `${calls.toFixed(0).padStart(4)} segments  ` +
      `${strokes.toFixed(1).padStart(4)} strokes (limit ${MAX_STROKES})  ` +
      `${budget.toFixed(1)}% of the frame budget` +
      `${over ? '   <-- over budget' : ''}`,
  )
}

if (failures > 0) {
  console.error(`\n${failures} viewport(s) over budget.`)
  process.exitCode = 1
}
