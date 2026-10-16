/**
 * Prints the per-frame cost of the background scene at the two viewports the
 * brief asks about. Run with `npm run bg:cost`.
 *
 * What this measures: the JavaScript the scene runs per frame, and the number
 * of dots and `fill()` calls it hands the canvas. On the desktop viewport the
 * cursor sweeps across the lower half, so the dent and a full ring buffer of
 * ripples (the expensive part) are always on. On the phone viewport the tilt
 * hook is driven instead, which also switches on the handheld sway, and a
 * jolt drops a ripple every half second. What it does not measure: GPU
 * rasterisation of those calls, which needs a real browser. Draw-call count is
 * the honest proxy for that half, and it is the half we control.
 */
import { performance } from 'node:perf_hooks'
import { createWaveScene } from '../app/utils/backgrounds/waveScene'
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
  let dots = 0
  let fills = 0
  return {
    get dots() {
      return dots
    },
    get fills() {
      return fills
    },
    clearRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    rect: () => {
      dots += 1
    },
    arc: () => {
      dots += 1
    },
    fill: () => {
      fills += 1
    },
    fillStyle: '',
  }
}

const FRAMES = 600
/** Budget from the FTR-34 plan: ms of scene JavaScript per frame, in Node. */
const DESKTOP_MS = 2
const PHONE_MS = 1
const MAX_FILLS = 12

let failures = 0
for (const viewport of VIEWPORTS) {
  const scene = createWaveScene()
  scene.layout(viewport.size)
  const { width, height, small } = viewport.size
  const ctx = stubContext() as unknown as CanvasRenderingContext2D & {
    dots: number
    fills: number
  }
  const step = 1000 / viewport.fps
  let frame = 0
  const drive = () => {
    if (small) {
      scene.tilt?.(0.4 * Math.sin(frame / 40), -0.3)
      if (frame % 12 === 0) scene.jolt?.(0.8)
    } else {
      // Back and forth across the lower half, 60px a frame: a ripple every
      // frame, so the ring buffer stays full.
      const x = width / 2 + (width / 3) * Math.sin(frame / 20)
      scene.pointer?.(x, height * 0.7)
    }
    scene.draw(ctx, viewport.size, step)
    frame += 1
  }

  // Warm the JIT before timing.
  for (let i = 0; i < 60; i += 1) drive()

  const before = ctx.dots
  const fillsBefore = ctx.fills
  const started = performance.now()
  for (let i = 0; i < FRAMES; i += 1) drive()
  const perFrame = (performance.now() - started) / FRAMES
  const dots = (ctx.dots - before) / FRAMES
  const fills = (ctx.fills - fillsBefore) / FRAMES

  const limit = small ? PHONE_MS : DESKTOP_MS
  const over = perFrame > limit || fills > MAX_FILLS
  if (over) failures += 1
  const budget = (perFrame / step) * 100
  console.log(
    `wave  ${viewport.label}  @${String(viewport.fps).padStart(2)}fps  ` +
      `${perFrame.toFixed(3)} ms/frame (limit ${limit})  ` +
      `${dots.toFixed(0).padStart(5)} dots  ` +
      `${fills.toFixed(1).padStart(4)} fills (limit ${MAX_FILLS})  ` +
      `${budget.toFixed(1)}% of the frame budget` +
      `${over ? '   <-- over budget' : ''}`,
  )
}

if (failures > 0) {
  console.error(`\n${failures} viewport(s) over budget.`)
  process.exitCode = 1
}
