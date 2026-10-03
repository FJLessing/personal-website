import type { BackgroundScene, SceneSize } from './scene'

/**
 * Concept one — "Contour".
 *
 * A slow height field drawn as topographic isolines. Four soft peaks drift on
 * Lissajous paths; the cursor presses a dent into the terrain so the lines
 * bunch up around it. The sampling grid is a flat Float32Array and each level
 * is one marching-squares pass stroked as a single path, which is what keeps
 * this cheap enough to run behind text.
 */

/** The site accent, borrowed rather than reinvented. */
const ACCENT = '240, 177, 0'

interface Lobe {
  /** Lissajous centre, as a fraction of the viewport. */
  readonly cx: number
  readonly cy: number
  /** Lissajous radii, as a fraction of the viewport. */
  readonly rx: number
  readonly ry: number
  /** Turns per second on each axis. Slow: a full loop takes 15-30s. */
  readonly sx: number
  readonly sy: number
  readonly phase: number
  /** Peak height, relative to the others. */
  readonly amp: number
  /** Falloff radius, as a fraction of the viewport diagonal. */
  readonly spread: number
}

const LOBES: readonly Lobe[] = [
  { cx: 0.28, cy: 0.3, rx: 0.16, ry: 0.11, sx: 0.055, sy: 0.041, phase: 0, amp: 1, spread: 0.3 }, // prettier-ignore
  { cx: 0.74, cy: 0.58, rx: 0.13, ry: 0.17, sx: -0.043, sy: 0.063, phase: 1.9, amp: 0.85, spread: 0.26 }, // prettier-ignore
  { cx: 0.52, cy: 0.84, rx: 0.21, ry: 0.09, sx: 0.071, sy: -0.037, phase: 3.4, amp: 0.7, spread: 0.34 }, // prettier-ignore
  { cx: 0.12, cy: 0.76, rx: 0.1, ry: 0.14, sx: -0.059, sy: -0.049, phase: 5.1, amp: 0.6, spread: 0.22 }, // prettier-ignore
]

/** One extra slot on the end of the resolved-lobe arrays for the cursor. */
const SLOTS = LOBES.length + 1
const POINTER_SLOT = LOBES.length

export function createContourScene(): BackgroundScene {
  // Resolved lobe centres, amplitudes and squared falloff radii for the
  // current frame. Allocated once so the sampling loop never allocates.
  const lobeX = new Float64Array(SLOTS)
  const lobeY = new Float64Array(SLOTS)
  const lobeAmp = new Float64Array(SLOTS)
  const lobeFalloff = new Float64Array(SLOTS)

  let cell = 17
  let cols = 0
  let rows = 0
  let levels = 6
  let field = new Float32Array(0)
  let diagonal = 1
  let time = 0

  // Raw pointer, plus the eased position and weight the field actually uses,
  // so the dent arrives and leaves smoothly instead of snapping.
  let pointerX: number | null = null
  let pointerY: number | null = null
  let dentX = 0
  let dentY = 0
  let dentWeight = 0

  const resolveLobes = (size: SceneSize) => {
    let i = 0
    for (const lobe of LOBES) {
      lobeX[i] =
        (lobe.cx + Math.cos(time * lobe.sx * Math.PI * 2 + lobe.phase) * lobe.rx) * // prettier-ignore
        size.width
      lobeY[i] =
        (lobe.cy + Math.sin(time * lobe.sy * Math.PI * 2 + lobe.phase) * lobe.ry) * // prettier-ignore
        size.height
      lobeAmp[i] = lobe.amp
      const radius = lobe.spread * diagonal
      lobeFalloff[i] = radius * radius
      i += 1
    }

    lobeX[POINTER_SLOT] = dentX
    lobeY[POINTER_SLOT] = dentY
    // Negative: the cursor pushes the terrain down, which pulls contour lines
    // towards it rather than scattering them.
    lobeAmp[POINTER_SLOT] = -1.1 * dentWeight
    const dentRadius = 0.16 * diagonal
    lobeFalloff[POINTER_SLOT] = dentRadius * dentRadius
  }

  /** Fills `field` and returns the range, so levels can be spread over it. */
  const sampleField = (size: SceneSize) => {
    resolveLobes(size)
    let min = Infinity
    let max = -Infinity
    let k = 0
    for (let row = 0; row < rows; row += 1) {
      const y = row * cell
      for (let col = 0; col < cols; col += 1) {
        const x = col * cell
        let value = 0
        for (let i = 0; i < SLOTS; i += 1) {
          const dx = x - lobeX[i]!
          const dy = y - lobeY[i]!
          value += lobeAmp[i]! / (1 + (dx * dx + dy * dy) / lobeFalloff[i]!)
        }
        if (value < min) min = value
        if (value > max) max = value
        field[k] = value
        k += 1
      }
    }
    return { min, max }
  }

  /**
   * Marching squares for one level. Corner bits are top-left 1, top-right 2,
   * bottom-right 4, bottom-left 8; 0 and 15 are the empty cases and carry the
   * overwhelming majority of cells, so they bail before any arithmetic.
   */
  const traceLevel = (ctx: CanvasRenderingContext2D, level: number) => {
    for (let row = 0; row < rows - 1; row += 1) {
      const base = row * cols
      const y0 = row * cell
      const y1 = y0 + cell
      for (let col = 0; col < cols - 1; col += 1) {
        const tl = field[base + col]!
        const tr = field[base + col + 1]!
        const bl = field[base + cols + col]!
        const br = field[base + cols + col + 1]!

        let index = 0
        if (tl > level) index |= 1
        if (tr > level) index |= 2
        if (br > level) index |= 4
        if (bl > level) index |= 8
        if (index === 0 || index === 15) continue

        // An edge point is only read when its two corners sit on opposite
        // sides of the level, which guarantees a non-zero denominator.
        const x0 = col * cell
        const x1 = x0 + cell
        const topX = x0 + cell * ((level - tl) / (tr - tl))
        const bottomX = x0 + cell * ((level - bl) / (br - bl))
        const leftY = y0 + cell * ((level - tl) / (bl - tl))
        const rightY = y0 + cell * ((level - tr) / (br - tr))

        switch (index) {
          case 1:
          case 14:
            ctx.moveTo(x0, leftY)
            ctx.lineTo(topX, y0)
            break
          case 2:
          case 13:
            ctx.moveTo(topX, y0)
            ctx.lineTo(x1, rightY)
            break
          case 3:
          case 12:
            ctx.moveTo(x0, leftY)
            ctx.lineTo(x1, rightY)
            break
          case 4:
          case 11:
            ctx.moveTo(x1, rightY)
            ctx.lineTo(bottomX, y1)
            break
          case 6:
          case 9:
            ctx.moveTo(topX, y0)
            ctx.lineTo(bottomX, y1)
            break
          case 7:
          case 8:
            ctx.moveTo(x0, leftY)
            ctx.lineTo(bottomX, y1)
            break
          // The two saddles. Either resolution is valid; this one keeps the
          // lines from touching, which looks right at this line weight.
          case 5:
            ctx.moveTo(x0, leftY)
            ctx.lineTo(topX, y0)
            ctx.moveTo(x1, rightY)
            ctx.lineTo(bottomX, y1)
            break
          case 10:
            ctx.moveTo(topX, y0)
            ctx.lineTo(x1, rightY)
            ctx.moveTo(x0, leftY)
            ctx.lineTo(bottomX, y1)
            break
        }
      }
    }
  }

  const render = (ctx: CanvasRenderingContext2D, size: SceneSize) => {
    const { min, max } = sampleField(size)
    ctx.clearRect(0, 0, size.width, size.height)
    const span = max - min
    if (span <= 0) return

    ctx.lineWidth = 1
    ctx.lineCap = 'round'
    for (let i = 1; i <= levels; i += 1) {
      const level = min + (span * i) / (levels + 1)
      // Higher ground reads brighter, so the terrain has depth without a
      // second colour and without ever getting near the text contrast.
      const alpha = 0.05 + (i / levels) * 0.15
      ctx.strokeStyle = `rgba(${ACCENT}, ${alpha.toFixed(3)})`
      ctx.beginPath()
      traceLevel(ctx, level)
      ctx.stroke()
    }
  }

  return {
    layout(size) {
      // Coarser grid and fewer levels on a phone: a quarter of the cells of
      // the desktop grid at the same physical size, and two fewer passes.
      cell = size.small ? 26 : 17
      levels = size.small ? 4 : 6
      cols = Math.ceil(size.width / cell) + 1
      rows = Math.ceil(size.height / cell) + 1
      field = new Float32Array(cols * rows)
      diagonal = Math.hypot(size.width, size.height)
    },

    draw(ctx, size, step) {
      time += step / 1000
      // ~220ms to converge, frame-rate independent.
      const ease = Math.min(1, step / 220)
      if (pointerX !== null && pointerY !== null) {
        if (dentWeight === 0) {
          dentX = pointerX
          dentY = pointerY
        }
        dentX += (pointerX - dentX) * ease
        dentY += (pointerY - dentY) * ease
        dentWeight += (1 - dentWeight) * ease
      } else {
        dentWeight -= dentWeight * ease
      }
      render(ctx, size)
    },

    still(ctx, size) {
      render(ctx, size)
    },

    pointer(x, y) {
      pointerX = x
      pointerY = y
    },
  }
}
