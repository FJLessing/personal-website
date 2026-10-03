import {
  ACCENT,
  ACCENT_HOT,
  GLYPH_ALPHA_HOT,
  GLYPH_ALPHA_PEAK,
  GLYPH_STILL_ALPHA_HIGH,
  GLYPH_STILL_ALPHA_LOW,
  rgba,
} from './palette'
import type { BackgroundScene } from './scene'

/**
 * Concept two — "Glyph field".
 *
 * A sparse lattice of monospace characters that light up along a slow diagonal
 * wavefront and fade out again, with the cursor resolving whatever it passes
 * over into brighter, faster-flickering glyphs. It leans on the site's own IBM
 * Plex Mono rather than inventing a shape language.
 *
 * Cost is bounded by a hard cap on live glyphs, not by the grid size, so a
 * 1440px viewport does the same amount of `fillText` work as a 900px one.
 * `Math.random` is safe here: this scene only ever runs client-side, inside a
 * canvas, so there is no server HTML for it to disagree with.
 */

const CHARS = '0123456789ABCDEF<>[]{}()/\\|+-=*:;.'

/**
 * The site accent, and a hot variant for glyphs under the cursor. Both are
 * drawn opaque and modulated with `globalAlpha`; the two alpha budgets live in
 * `palette.ts` and are what the contrast test checks.
 */
const COOL = rgba(ACCENT, 1)
const HOT = rgba(ACCENT_HOT, 1)

interface Glyph {
  x: number
  y: number
  char: string
  /** Milliseconds left to live, and the total it started with. */
  left: number
  life: number
  /** 0..1 peak brightness, so the field is not uniform. */
  power: number
}

const pickChar = () => CHARS.charAt(Math.floor(Math.random() * CHARS.length))

export function createGlyphScene(): BackgroundScene {
  const glyphs: Glyph[] = []

  let font = ''
  let cellWidth = 8
  let cellHeight = 20
  let cols = 1
  let rows = 1
  let maxGlyphs = 200
  let spawnsPerSecond = 140
  let pointerRadius = 150

  /**
   * Position of the wavefront along the diagonal axis `u = (x/w + y/h) / 2`.
   * Runs past both ends so the band sweeps fully off screen before wrapping.
   */
  let front = -0.3
  let spawnDebt = 0

  let pointerX: number | null = null
  let pointerY: number | null = null

  const spawn = () => {
    let gridX = 0
    let gridY = 0
    // One in six ignores the wavefront, which keeps the rest of the screen
    // from going completely dead between sweeps.
    if (Math.random() < 0.17) {
      gridX = Math.random()
      gridY = Math.random()
    } else {
      let placed = false
      for (let attempt = 0; attempt < 4 && !placed; attempt += 1) {
        const u = front + (Math.random() - 0.5) * 0.5
        const x = Math.random()
        const y = 2 * u - x
        if (y < 0 || y > 1) continue
        gridX = x
        gridY = y
        placed = true
      }
      if (!placed) return
    }

    const col = Math.min(cols - 1, Math.floor(gridX * cols))
    const row = Math.min(rows - 1, Math.floor(gridY * rows))
    const life = 800 + Math.random() * 1400
    glyphs.push({
      x: col * cellWidth + cellWidth / 2,
      y: row * cellHeight + cellHeight / 2,
      char: pickChar(),
      left: life,
      life,
      // Floor at half: below that a glyph spends its whole life too faint to
      // read as a character, which is just noise in the gutter.
      power: 0.5 + Math.random() * 0.5,
    })
  }

  return {
    layout(size) {
      const fontSize = size.small ? 11 : 13
      // IBM Plex Mono advances 0.6em; the extra leading keeps rows legible as
      // a lattice rather than a solid block.
      cellWidth = fontSize * 0.6
      cellHeight = fontSize * 1.6
      cols = Math.max(1, Math.floor(size.width / cellWidth))
      rows = Math.max(1, Math.floor(size.height / cellHeight))
      // The cap is the whole performance story: a phone runs roughly a third
      // of the `fillText` calls a desktop does, at a lower frame rate.
      maxGlyphs = size.small ? 70 : 200
      // Average life is ~1.5s, so this holds the population near the cap.
      spawnsPerSecond = maxGlyphs / 1.5
      pointerRadius = size.small ? 90 : 150
      font = `${fontSize}px 'IBM Plex Mono', ui-monospace, monospace`
      // Old positions mean nothing after a resize.
      glyphs.length = 0
    },

    draw(ctx, size, step) {
      // ~16s for a full sweep, plus the run-off at each end.
      front += step / 10000
      if (front > 1.3) front = -0.3

      spawnDebt += (spawnsPerSecond * step) / 1000
      while (spawnDebt >= 1) {
        spawnDebt -= 1
        if (glyphs.length < maxGlyphs) spawn()
      }

      ctx.clearRect(0, 0, size.width, size.height)
      ctx.font = font
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = COOL
      let fill = COOL

      const hasPointer = pointerX !== null && pointerY !== null
      const px = pointerX ?? 0
      const py = pointerY ?? 0
      const radiusSquared = pointerRadius * pointerRadius
      // Probability that any one glyph re-rolls this frame.
      const rerollChance = step / 420

      // Age and draw in one pass, compacting in place so the dead ones are
      // dropped without allocating a new array every frame.
      let write = 0
      for (let i = 0; i < glyphs.length; i += 1) {
        const glyph = glyphs[i]!
        glyph.left -= step
        if (glyph.left <= 0) continue

        const age = 1 - glyph.left / glyph.life
        // Quick strike, slow decay.
        const envelope = age < 0.18 ? age / 0.18 : 1 - (age - 0.18) / 0.82
        let alpha = envelope * glyph.power * GLYPH_ALPHA_PEAK
        let hot = false

        if (hasPointer) {
          const dx = glyph.x - px
          const dy = glyph.y - py
          const distanceSquared = dx * dx + dy * dy
          if (distanceSquared < radiusSquared) {
            const near = 1 - Math.sqrt(distanceSquared) / pointerRadius
            hot = near > 0.4
            // Under the cursor a glyph is pulled up to its budget regardless
            // of the power it was born with: that is the point of the cursor.
            const lifted = hot
              ? envelope * GLYPH_ALPHA_HOT * (0.6 + 0.4 * near)
              : envelope * GLYPH_ALPHA_PEAK * (glyph.power + near)
            if (lifted > alpha) alpha = lifted
          }
        }

        // Hard ceiling, because the two colours have different budgets.
        const limit = hot ? GLYPH_ALPHA_HOT : GLYPH_ALPHA_PEAK
        if (alpha > limit) alpha = limit

        if (Math.random() < (hot ? rerollChance * 4 : rerollChance)) {
          glyph.char = pickChar()
        }

        const next = hot ? HOT : COOL
        if (next !== fill) {
          ctx.fillStyle = next
          fill = next
        }
        ctx.globalAlpha = alpha
        ctx.fillText(glyph.char, glyph.x, glyph.y)

        glyphs[write] = glyph
        write += 1
      }
      glyphs.length = write
      ctx.globalAlpha = 1
    },

    still(ctx, size) {
      ctx.clearRect(0, 0, size.width, size.height)
      ctx.font = font
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = COOL

      // Seeded so the still frame is the same picture every load, which is
      // what someone who asked for no motion is expecting.
      let seed = 0x2f6e2b1
      const random = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0
        return seed / 0x100000000
      }

      const count = Math.floor(maxGlyphs * 0.6)
      for (let i = 0; i < count; i += 1) {
        const col = Math.floor(random() * cols)
        const row = Math.floor(random() * rows)
        ctx.globalAlpha =
          GLYPH_STILL_ALPHA_LOW +
          random() * (GLYPH_STILL_ALPHA_HIGH - GLYPH_STILL_ALPHA_LOW)
        ctx.fillText(
          CHARS.charAt(Math.floor(random() * CHARS.length)),
          col * cellWidth + cellWidth / 2,
          row * cellHeight + cellHeight / 2,
        )
      }
      ctx.globalAlpha = 1
    },

    pointer(x, y) {
      pointerX = x
      pointerY = y
    },
  }
}
