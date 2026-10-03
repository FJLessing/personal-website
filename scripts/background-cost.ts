/**
 * Prints the per-frame cost of the background scene at the two viewports the
 * brief asks about. Run with `npm run bg:cost`.
 *
 * What this measures: the JavaScript the scene runs per frame, and the number
 * of draw calls it hands the canvas. What it does not measure: GPU
 * rasterisation of those calls, which needs a real browser. Draw-call count is
 * the honest proxy for that half, and it is the half we control.
 */
import { performance } from 'node:perf_hooks'
import { createContourScene } from '../app/utils/backgrounds/contourScene'
import type { SceneSize } from '../app/utils/backgrounds/scene'

const VIEWPORTS: Array<{ label: string; size: SceneSize; fps: number }> = [
  {
    label: '  360x740 (phone)',
    size: { width: 360, height: 740, dpr: 1.5, small: true },
    fps: 15,
  },
  {
    label: '1440x900 (desktop)',
    size: { width: 1440, height: 900, dpr: 2, small: false },
    fps: 24,
  },
]

function stubContext() {
  let lineTo = 0
  return {
    get drawCalls() {
      return lineTo
    },
    clearRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {
      lineTo += 1
    },
    stroke: () => {},
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt' as CanvasLineCap,
  }
}

const FRAMES = 600

for (const viewport of VIEWPORTS) {
  const scene = createContourScene()
  scene.layout(viewport.size)
  const ctx = stubContext() as unknown as CanvasRenderingContext2D & {
    drawCalls: number
  }
  const step = 1000 / viewport.fps

  // Warm the JIT before timing.
  for (let i = 0; i < 60; i += 1) scene.draw(ctx, viewport.size, step)

  const before = ctx.drawCalls
  const started = performance.now()
  for (let i = 0; i < FRAMES; i += 1) scene.draw(ctx, viewport.size, step)
  const perFrame = (performance.now() - started) / FRAMES
  const calls = (ctx.drawCalls - before) / FRAMES

  const budget = (perFrame / step) * 100
  console.log(
    `contour  ${viewport.label}  @${String(viewport.fps).padStart(2)}fps  ` +
      `${perFrame.toFixed(3)} ms/frame  ` +
      `${calls.toFixed(0).padStart(4)} draw calls  ` +
      `${budget.toFixed(1)}% of the frame budget`,
  )
}
