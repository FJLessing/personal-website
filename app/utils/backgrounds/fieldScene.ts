import {
  FIELD_ALPHA_LEVELS,
  FIELD_TONE_GAIN,
  FIELD_TONES,
  rgba,
} from './palette'
import type { BackgroundScene, SceneSize } from './scene'

/**
 * The site background, "Field".
 *
 * A jittered grid of short yellow dashes that turn and drift on a slow flow
 * field while a brightness wave crosses them. Around one influence point
 * (the cursor on a desktop; tilt and a slow wander on a phone) the dashes are
 * pushed out of a hole into a ring, turn tangent to it and grow longer and
 * brighter. Each dash rides a damped spring, so the ring follows the point
 * and settles back with a small overshoot.
 *
 * All per-dash state is a flat typed array allocated in `layout()`, and each
 * frame buckets the dashes by tone and alpha and strokes each bucket as one
 * path, so a frame costs at most twelve `stroke()` calls and no allocation.
 */

/** Alpha rungs per tone. Tones times rungs is the stroke count ceiling. */
const LEVELS = FIELD_ALPHA_LEVELS.length
const BUCKETS = FIELD_TONES.length * LEVELS

/** Line width per rung. Brighter rungs are fatter, not more opaque. */
const LEVEL_WIDTHS = [1.6, 1.6, 2, 2.4]

/** Hole radius at the influence point, as a fraction of the radius R. */
const HOLE = 0.45
/** Offset, as a fraction of `HOLE * R`, at which a dash is fully "on the ring". */
const RING_FULL = 0.7

/** Spring: ~1.4Hz, damping ratio 0.5, so it settles with a small overshoot. */
const OMEGA = 2 * Math.PI * 1.4
const STIFFNESS = OMEGA * OMEGA
const DAMPING = 2 * 0.5 * OMEGA
/** Longest integration substep, in seconds. Keeps the spring stable. */
const MAX_SUBSTEP = 1 / 40

/** Influence weight with no pointer and no tilt, on a handheld. */
const WANDER_WEIGHT = 0.35
/** Largest tilt parallax, in CSS pixels, for a dash of depth 1. */
const PARALLAX = 12
/** Velocity kick, in px/s, a full-strength jolt gives every dash. */
const JOLT_SPEED = 70

/** Mulberry32. Seeded, so the layout and the still frame are deterministic. */
function seededRandom(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createFieldScene(): BackgroundScene {
  // One stroke style per bucket, built once: bucket = tone * LEVELS + level.
  const styles: string[] = []
  for (let tone = 0; tone < FIELD_TONES.length; tone += 1) {
    for (let level = 0; level < LEVELS; level += 1) {
      styles.push(
        rgba(
          FIELD_TONES[tone]!,
          FIELD_ALPHA_LEVELS[level]! * FIELD_TONE_GAIN[tone]!,
        ),
      )
    }
  }

  let spacing = 22
  let radius = 180
  let cols = 0
  let rows = 0
  let count = 0

  // Per dash, fixed at layout.
  let restX = new Float32Array(0)
  let restY = new Float32Array(0)
  let depth = new Float32Array(0)
  let halfLength = new Float32Array(0)
  let skew = new Float32Array(0)
  let phase = new Float32Array(0)
  let kickX = new Float32Array(0)
  let kickY = new Float32Array(0)
  let tone = new Uint8Array(0)
  let colOf = new Uint16Array(0)
  let rowOf = new Uint16Array(0)

  // Per dash, the spring.
  let offX = new Float32Array(0)
  let offY = new Float32Array(0)
  let velX = new Float32Array(0)
  let velY = new Float32Array(0)
  let ring = new Float32Array(0)

  // Per dash, this frame's geometry and bucket; then the bucketed order.
  let fromX = new Float32Array(0)
  let fromY = new Float32Array(0)
  let toX = new Float32Array(0)
  let toY = new Float32Array(0)
  let bucket = new Uint8Array(0)
  let order = new Int32Array(0)
  const bucketCount = new Int32Array(BUCKETS)
  const bucketStart = new Int32Array(BUCKETS)

  // Per column and per row terms of the flow field and the brightness wave.
  // Both are sums of a column term and a row term, so the trig runs once per
  // column and row rather than once per dash.
  let colAngle = new Float64Array(0)
  let rowAngle = new Float64Array(0)
  let colWaveSin = new Float64Array(0)
  let colWaveCos = new Float64Array(0)
  let rowWaveSin = new Float64Array(0)
  let rowWaveCos = new Float64Array(0)

  let time = 0
  let pointerX: number | null = null
  let pointerY: number | null = null
  let tiltX: number | null = null
  let tiltY: number | null = null
  let handheld = false

  // The influence point the field actually uses, eased towards its target.
  let focusX = 0
  let focusY = 0
  let focusWeight = 0

  const fieldTerms = (t: number) => {
    for (let col = 0; col < cols; col += 1) {
      const x = (col - 0.5) * spacing
      colAngle[col] = 0.9 * Math.sin(x * 0.0045 + t * 0.12)
      const wave = x * 0.0055 - t * 0.45
      colWaveSin[col] = Math.sin(wave)
      colWaveCos[col] = Math.cos(wave)
    }
    for (let row = 0; row < rows; row += 1) {
      const y = (row - 0.5) * spacing
      rowAngle[row] = 0.9 * Math.cos(y * 0.006 - t * 0.09)
      const wave = y * 0.004
      rowWaveSin[row] = Math.sin(wave)
      rowWaveCos[row] = Math.cos(wave)
    }
  }

  /** Moves the influence point and its weight towards their targets. */
  const updateFocus = (size: SceneSize, step: number) => {
    let targetX = focusX
    let targetY = focusY
    let targetWeight = 0
    if (pointerX !== null && pointerY !== null) {
      targetX = pointerX
      targetY = pointerY
      targetWeight = 1
    } else if (handheld) {
      // A slow Lissajous wander, so a phone is never static, with the tilt
      // rolling the point across the screen on top of it.
      const tx = tiltX ?? 0
      const ty = tiltY ?? 0
      targetX = size.width * (0.5 + 0.28 * Math.sin(time * 0.13) + 0.35 * tx)
      targetY =
        size.height * (0.5 + 0.22 * Math.sin(time * 0.087 + 1) + 0.35 * ty)
      targetWeight =
        WANDER_WEIGHT +
        (1 - WANDER_WEIGHT) * Math.min(1, Math.hypot(tx, ty) * 1.5)
    }

    // A point arriving from nowhere starts where it is, rather than sweeping
    // in from wherever the last one left.
    if (focusWeight < 0.01 && targetWeight > 0) {
      focusX = targetX
      focusY = targetY
    }
    const move = 1 - Math.exp(-step / 120)
    focusX += (targetX - focusX) * move
    focusY += (targetY - focusY) * move
    // ~170ms time constant: the ring is gone about half a second after the
    // pointer leaves.
    focusWeight += (targetWeight - focusWeight) * (1 - Math.exp(-step / 170))
    if (focusWeight < 0.001) focusWeight = 0
  }

  /** Steps every dash's spring towards its displaced target. */
  const updateSprings = (step: number) => {
    const seconds = step / 1000
    const substeps = Math.max(1, Math.ceil(seconds / MAX_SUBSTEP))
    const h = seconds / substeps
    const parallaxX = (tiltX ?? 0) * PARALLAX
    const parallaxY = (tiltY ?? 0) * PARALLAX
    const push = HOLE * radius * focusWeight
    const radiusSq = radius * radius
    const ringScale = 1 / (HOLE * radius * RING_FULL)
    const active = focusWeight > 0

    for (let i = 0; i < count; i += 1) {
      let targetX = 0
      let targetY = 0
      if (active) {
        // Bounding-box cull first: the falloff maths only runs inside R.
        const dx = restX[i]! + parallaxX * depth[i]! - focusX
        const dy = restY[i]! + parallaxY * depth[i]! - focusY
        if (dx < radius && dx > -radius && dy < radius && dy > -radius) {
          const distSq = dx * dx + dy * dy
          if (distSq < radiusSq) {
            const dist = Math.sqrt(distSq)
            const inside = 1 - dist / radius
            // (1 - u)^2 keeps the radial map monotonic for HOLE <= 0.5, so
            // dashes bunch into a ring without passing through each other.
            const amount = push * inside * inside
            if (dist > 0.5) {
              targetX = (dx / dist) * amount
              targetY = (dy / dist) * amount
            } else {
              targetX = kickX[i]! * amount
              targetY = kickY[i]! * amount
            }
          }
        }
      }

      let ox = offX[i]!
      let oy = offY[i]!
      let vx = velX[i]!
      let vy = velY[i]!
      if (
        targetX === 0 &&
        targetY === 0 &&
        ox * ox + oy * oy < 1e-4 &&
        vx * vx + vy * vy < 1e-2
      ) {
        // At rest: skip the integration for the great majority of dashes.
        offX[i] = 0
        offY[i] = 0
        velX[i] = 0
        velY[i] = 0
        ring[i] = 0
        continue
      }
      for (let s = 0; s < substeps; s += 1) {
        vx += (STIFFNESS * (targetX - ox) - DAMPING * vx) * h
        vy += (STIFFNESS * (targetY - oy) - DAMPING * vy) * h
        ox += vx * h
        oy += vy * h
      }
      offX[i] = ox
      offY[i] = oy
      velX[i] = vx
      velY[i] = vy
      ring[i] = Math.min(1, Math.sqrt(ox * ox + oy * oy) * ringScale)
    }
  }

  /**
   * Works out every dash's segment and bucket, then strokes one path per
   * bucket. `live` is false for the still frame, which ignores the springs,
   * the tilt and the influence point entirely.
   */
  const render = (
    ctx: CanvasRenderingContext2D,
    size: SceneSize,
    t: number,
    live: boolean,
  ) => {
    fieldTerms(t)
    const parallaxX = live ? (tiltX ?? 0) * PARALLAX : 0
    const parallaxY = live ? (tiltY ?? 0) * PARALLAX : 0
    bucketCount.fill(0)

    for (let i = 0; i < count; i += 1) {
      const col = colOf[i]!
      const row = rowOf[i]!
      const angle = colAngle[col]! + rowAngle[row]! + skew[i]!
      let dirX = Math.cos(angle)
      let dirY = Math.sin(angle)
      // Each dash slides a few pixels back and forth along itself.
      const drift = 2.5 * Math.sin(t * 0.5 + phase[i]!)
      let midX = restX[i]! + dirX * drift
      let midY = restY[i]! + dirY * drift
      let onRing = 0

      if (live) {
        const d = depth[i]!
        midX += parallaxX * d + offX[i]!
        midY += parallaxY * d + offY[i]!
        onRing = ring[i]!
        if (onRing > 0) {
          // Turn towards the tangent of the ring, which is perpendicular to
          // the offset, on whichever side is nearer the current heading.
          const ox = offX[i]!
          const oy = offY[i]!
          const length = Math.sqrt(ox * ox + oy * oy)
          let tanX = -oy / length
          let tanY = ox / length
          if (tanX * dirX + tanY * dirY < 0) {
            tanX = -tanX
            tanY = -tanY
          }
          dirX += (tanX - dirX) * onRing
          dirY += (tanY - dirY) * onRing
          const norm = Math.sqrt(dirX * dirX + dirY * dirY) || 1
          dirX /= norm
          dirY /= norm
        }
      }

      const half = halfLength[i]! * (1 + 0.9 * onRing)
      fromX[i] = midX - dirX * half
      fromY[i] = midY - dirY * half
      toX[i] = midX + dirX * half
      toY[i] = midY + dirY * half

      // sin(a + b) from the column and row halves of the wave.
      const wave =
        0.5 +
        0.5 * (colWaveSin[col]! * rowWaveCos[row]! + colWaveCos[col]! * rowWaveSin[row]!) // prettier-ignore
      // The idle wave spans the bottom third of the ladder (rungs 0-1); the
      // ring lifts a dash the rest of the way to the peak.
      const intensity = wave / 3 + onRing * (1 - wave / 3)
      const level = Math.min(LEVELS - 1, Math.round(intensity * (LEVELS - 1)))
      const b = tone[i]! * LEVELS + level
      bucket[i] = b
      bucketCount[b] = bucketCount[b]! + 1
    }

    // Counting sort into bucket order, so each bucket is one contiguous run.
    let start = 0
    for (let b = 0; b < BUCKETS; b += 1) {
      bucketStart[b] = start
      start += bucketCount[b]!
    }
    for (let i = 0; i < count; i += 1) {
      const b = bucket[i]!
      order[bucketStart[b]!] = i
      bucketStart[b] = bucketStart[b]! + 1
    }

    ctx.clearRect(0, 0, size.width, size.height)
    ctx.lineCap = 'round'
    let end = 0
    for (let b = 0; b < BUCKETS; b += 1) {
      const from = end
      end += bucketCount[b]!
      if (from === end) continue
      ctx.strokeStyle = styles[b]!
      ctx.lineWidth = LEVEL_WIDTHS[b % LEVELS]!
      ctx.beginPath()
      for (let k = from; k < end; k += 1) {
        const i = order[k]!
        ctx.moveTo(fromX[i]!, fromY[i]!)
        ctx.lineTo(toX[i]!, toY[i]!)
      }
      ctx.stroke()
    }
  }

  return {
    layout(size) {
      // Sparser and smaller on a phone: about a seventh of the desktop dashes.
      spacing = size.small ? 30 : 22
      radius = size.small ? 140 : 180
      // One cell of overscan on every side, so parallax never shows an edge.
      cols = Math.ceil(size.width / spacing) + 3
      rows = Math.ceil(size.height / spacing) + 3
      count = cols * rows

      restX = new Float32Array(count)
      restY = new Float32Array(count)
      depth = new Float32Array(count)
      halfLength = new Float32Array(count)
      skew = new Float32Array(count)
      phase = new Float32Array(count)
      kickX = new Float32Array(count)
      kickY = new Float32Array(count)
      tone = new Uint8Array(count)
      colOf = new Uint16Array(count)
      rowOf = new Uint16Array(count)
      offX = new Float32Array(count)
      offY = new Float32Array(count)
      velX = new Float32Array(count)
      velY = new Float32Array(count)
      ring = new Float32Array(count)
      fromX = new Float32Array(count)
      fromY = new Float32Array(count)
      toX = new Float32Array(count)
      toY = new Float32Array(count)
      bucket = new Uint8Array(count)
      order = new Int32Array(count)
      colAngle = new Float64Array(cols)
      colWaveSin = new Float64Array(cols)
      colWaveCos = new Float64Array(cols)
      rowAngle = new Float64Array(rows)
      rowWaveSin = new Float64Array(rows)
      rowWaveCos = new Float64Array(rows)

      const random = seededRandom(0x5eed)
      const shortest = size.small ? 3.5 : 3
      let i = 0
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          restX[i] = (col - 0.5 + (random() - 0.5) * 0.7) * spacing
          restY[i] = (row - 0.5 + (random() - 0.5) * 0.7) * spacing
          depth[i] = 0.4 + random() * 0.6
          halfLength[i] = shortest + random() * 2.5
          skew[i] = (random() - 0.5) * 0.5
          phase[i] = random() * Math.PI * 2
          const kick = random() * Math.PI * 2
          kickX[i] = Math.cos(kick)
          kickY[i] = Math.sin(kick)
          // Mostly the accent, with amber and light yellow mixed through.
          const pick = random()
          tone[i] = pick < 0.3 ? 0 : pick < 0.8 ? 1 : 2
          colOf[i] = col
          rowOf[i] = row
          i += 1
        }
      }
    },

    draw(ctx, size, step) {
      time += step / 1000
      updateFocus(size, step)
      updateSprings(step)
      render(ctx, size, time, true)
    },

    still(ctx, size) {
      // Reduced motion: the idle field at t = 0. No ring, no tilt, and no
      // internal state touched, so it is the same frame every time.
      render(ctx, size, 0, false)
    },

    pointer(x, y) {
      pointerX = x
      pointerY = y
    },

    tilt(x, y) {
      handheld = true
      tiltX = x
      tiltY = y
    },

    jolt(strength) {
      const speed = JOLT_SPEED * Math.max(0, Math.min(1, strength))
      for (let i = 0; i < count; i += 1) {
        velX[i] = velX[i]! + kickX[i]! * speed
        velY[i] = velY[i]! + kickY[i]! * speed
      }
    },
  }
}
