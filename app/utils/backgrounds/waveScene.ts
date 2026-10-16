import {
  WAVE_ALPHA_LEVELS,
  WAVE_MAX_RADIUS,
  WAVE_TONE_GAIN,
  WAVE_TONES,
  rgba,
} from './palette'
import type { BackgroundScene, SceneSize } from './scene'

/**
 * The site background, "Wave".
 *
 * A grid of yellow dots laid on a rolling water surface and seen in
 * perspective, filling the bottom two thirds of the viewport. The height of
 * the surface is a sum of three travelling sine waves, so slow swells roll
 * through it on every device with no input at all. Near dots are bigger and
 * brighter than far ones, and crests are brighter than troughs, so the shape
 * still reads by the horizon.
 *
 * On a desktop the cursor dents the surface and, as it moves, drops ripples
 * that spread out and die away. On a phone the tilt rolls the horizon and
 * moves it up and down, a shake drops a ripple, and a slow sway keeps the
 * view moving when nobody touches it.
 *
 * The camera is a pinhole: a world point (x, y, z) lands at
 * `sx = cx + x·f/z`, `sy = horizon + (camH − y)·f/z`, and the whole picture is
 * then rotated about the screen centre by the roll. Rows are spaced evenly in
 * 1/z, so they are evenly spaced on screen and further apart in the world the
 * further away they are. Every row spans the screen, so the world width of a
 * row grows with its distance and the swells shorten towards the horizon as
 * they should.
 *
 * All per-dot state is a flat typed array allocated in `layout()`, and each
 * frame buckets the dots by tone and alpha and fills each bucket as one path,
 * so a frame costs at most twelve `fill()` calls and no allocation.
 */

/** Alpha rungs per tone. Tones times rungs is the fill count ceiling. */
const LEVELS = WAVE_ALPHA_LEVELS.length
const BUCKETS = WAVE_TONES.length * LEVELS
const TAU = Math.PI * 2

/** Horizon, as a fraction of the viewport height from the top. */
const HORIZON = 0.33
/** Where the farthest row sits under the horizon, as a fraction of the water. */
const FAR_ROW = 0.02
/** Below this radius a dot is a square `rect()`; above it, an `arc()`. */
const RECT_BELOW = 0.75

/** Largest roll of the horizon, in radians, at a full tilt. */
const MAX_ROLL = (8 * Math.PI) / 180
/** Largest move of the horizon, as a fraction of the viewport height. */
const MAX_PITCH = 0.08
/** Idle sway on a handheld, in tilt units (-1..1). */
const SWAY_ROLL = 0.14
const SWAY_PITCH = 0.12
/** Time constant, in ms, the camera eases towards the tilt with. */
const CAMERA_MS = 220

/**
 * The swells: amplitude (world units, the camera sits about 1 up), direction
 * on the water (x, z), wavelength (world units) and period (seconds). The
 * first is the main swell, the other two break up its repetition.
 */
const WAVES = [
  { amp: 0.06, dirX: 0.38, dirZ: -0.92, length: 1.9, period: 8.5 },
  { amp: 0.026, dirX: -0.62, dirZ: -0.78, length: 1.15, period: 6.5 },
  { amp: 0.014, dirX: 0.93, dirZ: -0.37, length: 0.62, period: 4.4 },
] as const
const WAVE_SUM = WAVES.reduce((sum, w) => sum + w.amp, 0)
/** How far a full roll turns the swells sideways, as a share of their heading. */
const ROLL_STEER = 0.6
/**
 * Distance at which the crest brightness has halved. Past a few world units
 * the rows are further apart than a wavelength, and the crests would alias
 * into noise if they were not faded out.
 */
const CLEAR_Z = 4.5

/** Pointer dent: radius in CSS pixels at the pointer, and depth in px. */
const DENT_RADIUS = 110
const DENT_DEPTH = 40
/**
 * How far the dent pushes dots outward, as a share of their distance. Below
 * about 2 the push stays monotonic, so dots part without crossing; at 0.8 the
 * tightest bunching on the rim is 60% of the grid spacing, still clear of
 * `WAVE_MIN_SPACING`.
 */
const DENT_SPREAD = 0.8
/** Time constant, in ms, of the dent easing in and out. */
const DENT_MS = 160

/** Ripples: ring buffer size, life, speed and band width in CSS pixels. */
const RIPPLES = 6
const RIPPLE_LIFE = 2.2
const RIPPLE_SPEED = 230
const RIPPLE_WIDTH = 34
/** Ripple height, in CSS pixels at its centre's depth, at full strength. */
const RIPPLE_HEIGHT = 16
/** Pointer travel, in CSS pixels, that drops a new ripple. */
const RIPPLE_STRIDE = 40

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

/** The camera for one frame. */
interface Camera {
  horizon: number
  camH: number
  cos: number
  sin: number
  roll: number
}

export function createWaveScene(): BackgroundScene {
  // One fill style per bucket, built once: bucket = tone * LEVELS + level.
  const styles: string[] = []
  for (let tone = 0; tone < WAVE_TONES.length; tone += 1) {
    for (let level = 0; level < LEVELS; level += 1) {
      styles.push(
        rgba(
          WAVE_TONES[tone]!,
          WAVE_ALPHA_LEVELS[level]! * WAVE_TONE_GAIN[tone]!,
        ),
      )
    }
  }
  const waveK = WAVES.map((w) => TAU / w.length)
  const waveW = WAVES.map((w) => TAU / w.period)

  let width = 0
  let height = 0
  let focal = 1
  let bottom = 0
  let halfSpan = 0
  let cols = 0
  let rows = 0
  let count = 0

  // Per row and per column, fixed at layout. Row 0 is the farthest.
  let rowZ = new Float64Array(0)
  let rowNear = new Float64Array(0)
  let rowClear = new Float64Array(0)
  let colU = new Float64Array(0)

  // Per dot, fixed at layout.
  let jitter = new Float32Array(0)
  let toneSeed = new Float32Array(0)

  // Per dot, this frame's geometry and bucket; then the bucketed order.
  let dotX = new Float32Array(0)
  let dotY = new Float32Array(0)
  let dotR = new Float32Array(0)
  let bucket = new Uint8Array(0)
  let order = new Int32Array(0)
  const bucketCount = new Int32Array(BUCKETS)
  const bucketStart = new Int32Array(BUCKETS)

  // Ripples, as a ring buffer: centre on the water, age, strength and the
  // world size of one CSS pixel at the centre, so a ripple looks the same size
  // on screen wherever it starts.
  const rippleX = new Float64Array(RIPPLES)
  const rippleZ = new Float64Array(RIPPLES)
  const rippleAge = new Float64Array(RIPPLES).fill(Infinity)
  const rippleStrength = new Float64Array(RIPPLES)
  const rippleScale = new Float64Array(RIPPLES)
  let rippleNext = 0

  const random = seededRandom(0x3a7e)

  let time = 0
  let pointerX: number | null = null
  let pointerY: number | null = null
  let lastRippleX = 0
  let lastRippleY = 0
  let rippleArmed = false
  let tiltX: number | null = null
  let tiltY: number | null = null
  let handheld = false

  // What the frame actually uses, eased towards its target.
  let roll = 0
  let pitch = 0
  let dentWeight = 0
  let dentX = 0
  let dentZ = 1
  let dentScale = 0

  const camera: Camera = { horizon: 0, camH: 1, cos: 1, sin: 0, roll: 0 }
  const neutral: Camera = { horizon: 0, camH: 1, cos: 1, sin: 0, roll: 0 }

  const setCamera = (target: Camera, rollTilt: number, pitchTilt: number) => {
    target.horizon = height * (HORIZON + MAX_PITCH * pitchTilt)
    // The camera rises or sinks with the horizon, so the nearest row always
    // lands just under the bottom edge: looking down into the water when the
    // horizon is high, across it when it is low.
    target.camH = (bottom - target.horizon) / focal
    // The horizon stays level in the world, so on screen it turns against
    // the roll of the device.
    const angle = -MAX_ROLL * rollTilt
    target.cos = Math.cos(angle)
    target.sin = Math.sin(angle)
    target.roll = rollTilt
  }

  /**
   * Inverse projection: the point on the flat water under a screen point.
   * Above the horizon, it is the farthest row. Writes into `hit`.
   */
  const hit = { x: 0, z: 1 }
  const toWater = (cam: Camera, sx: number, sy: number) => {
    const cx = width / 2
    const cy = height / 2
    // Undo the roll.
    const dx = sx - cx
    const dy = sy - cy
    const px = cx + dx * cam.cos + dy * cam.sin
    const py = cy - dx * cam.sin + dy * cam.cos
    const below = py - cam.horizon
    const farthest = rowZ[0]!
    const z =
      below <= 0 ? farthest : Math.min(farthest, (cam.camH * focal) / below)
    hit.x = ((px - cx) * z) / focal
    hit.z = Math.max(rowZ[rows - 1]!, z)
  }

  const spawnRipple = (x: number, z: number, strength: number) => {
    const slot = rippleNext
    rippleNext = (rippleNext + 1) % RIPPLES
    rippleX[slot] = x
    rippleZ[slot] = z
    rippleAge[slot] = 0
    rippleStrength[slot] = strength
    rippleScale[slot] = z / focal
  }

  /** Moves the camera, the dent and the ripples on by `step` ms. */
  const update = (step: number) => {
    const seconds = step / 1000
    time += seconds

    let targetRoll = 0
    let targetPitch = 0
    if (handheld) {
      // A slow Lissajous sway, so a phone is never static, with the tilt on
      // top of it.
      targetRoll = SWAY_ROLL * Math.sin(time * 0.31) + (tiltX ?? 0)
      targetPitch = SWAY_PITCH * Math.sin(time * 0.19 + 1) + (tiltY ?? 0)
    }
    const ease = 1 - Math.exp(-step / CAMERA_MS)
    roll += (Math.max(-1, Math.min(1, targetRoll)) - roll) * ease
    pitch += (Math.max(-1, Math.min(1, targetPitch)) - pitch) * ease
    setCamera(camera, roll, pitch)

    const pointing = pointerX !== null && pointerY !== null
    if (pointing) {
      toWater(camera, pointerX!, pointerY!)
      dentX = hit.x
      dentZ = hit.z
      dentScale = hit.z / focal
      const moved = Math.hypot(pointerX! - lastRippleX, pointerY! - lastRippleY)
      if (!rippleArmed) {
        rippleArmed = true
        lastRippleX = pointerX!
        lastRippleY = pointerY!
      } else if (moved > RIPPLE_STRIDE) {
        lastRippleX = pointerX!
        lastRippleY = pointerY!
        spawnRipple(hit.x, hit.z, 1)
      }
    } else {
      rippleArmed = false
    }
    // About half a second to fade out once the pointer leaves.
    dentWeight +=
      ((pointing ? 1 : 0) - dentWeight) * (1 - Math.exp(-step / DENT_MS))
    if (dentWeight < 0.002) dentWeight = 0

    for (let r = 0; r < RIPPLES; r += 1) {
      if (rippleAge[r]! < RIPPLE_LIFE) rippleAge[r] = rippleAge[r]! + seconds
    }
  }

  /**
   * Works out every dot's position, size and bucket, then fills one path per
   * bucket. `live` is false for the still frame, which ignores the tilt, the
   * dent and the ripples entirely.
   */
  const render = (
    ctx: CanvasRenderingContext2D,
    t: number,
    cam: Camera,
    live: boolean,
  ) => {
    const cx = width / 2
    const cy = height / 2
    const { horizon, camH, cos, sin } = cam
    const steer = ROLL_STEER * cam.roll
    const dent = live ? dentWeight : 0
    const dentSigma = DENT_RADIUS * dentScale
    const dentReach = 9 * dentSigma * dentSigma
    const dentInv = 1 / (2 * dentSigma * dentSigma)

    // Per wave, this frame's heading and phase.
    const k0 = waveK[0]!
    const k1 = waveK[1]!
    const k2 = waveK[2]!
    const ax0 = k0 * (WAVES[0].dirX + steer)
    const ax1 = k1 * (WAVES[1].dirX + steer)
    const ax2 = k2 * (WAVES[2].dirX + steer)
    const az0 = k0 * WAVES[0].dirZ
    const az1 = k1 * WAVES[1].dirZ
    const az2 = k2 * WAVES[2].dirZ
    const p0 = waveW[0]! * t
    const p1 = waveW[1]! * t + 1.7
    const p2 = waveW[2]! * t + 4.1
    const a0 = WAVES[0].amp
    const a1 = WAVES[1].amp
    const a2 = WAVES[2].amp

    let ripples = 0
    if (live) {
      for (let r = 0; r < RIPPLES; r += 1) {
        if (rippleAge[r]! < RIPPLE_LIFE) ripples += 1
      }
    }

    bucketCount.fill(0)
    const margin = WAVE_MAX_RADIUS + 1
    let i = 0
    for (let row = 0; row < rows; row += 1) {
      const z0 = rowZ[row]!
      const near = rowNear[row]!
      const clear = rowClear[row]!
      const span = (halfSpan * z0) / focal
      const zPhase0 = az0 * z0 - p0
      const zPhase1 = az1 * z0 - p1
      const zPhase2 = az2 * z0 - p2
      for (let col = 0; col < cols; col += 1, i += 1) {
        let x = (colU[col]! + jitter[i]!) * span
        let z = z0
        let y =
          a0 * Math.sin(ax0 * x + zPhase0) +
          a1 * Math.sin(ax1 * x + zPhase1) +
          a2 * Math.sin(ax2 * x + zPhase2)
        // Crest, -1..1, faded by distance before it can alias.
        let lift = (y / WAVE_SUM) * clear

        if (dent > 0) {
          const dx = x - dentX
          const dz = z - dentZ
          const distSq = dx * dx + dz * dz
          if (distSq < dentReach) {
            const g = dent * Math.exp(-distSq * dentInv)
            // Down, and out from under the pointer.
            y -= DENT_DEPTH * dentScale * g
            x += dx * DENT_SPREAD * g
            z += dz * DENT_SPREAD * g
            // Dim in the hollow, bright on the rim where the dots bunch up.
            lift += 3.2 * g * (1 - g) - 0.7 * g * g
          }
        }

        if (ripples > 0) {
          for (let r = 0; r < RIPPLES; r += 1) {
            const age = rippleAge[r]!
            if (age >= RIPPLE_LIFE) continue
            const scale = rippleScale[r]!
            const band = RIPPLE_WIDTH * scale
            const front = RIPPLE_SPEED * scale * age
            const dx = x - rippleX[r]!
            const dz = z - rippleZ[r]!
            const distSq = dx * dx + dz * dz
            const inner = front - 2 * band
            const outer = front + 2 * band
            if (distSq > outer * outer) continue
            if (inner > 0 && distSq < inner * inner) continue
            const offset = (Math.sqrt(distSq) - front) / band
            const fade = 1 - age / RIPPLE_LIFE
            const ring =
              rippleStrength[r]! *
              fade *
              fade *
              Math.exp(-offset * offset * 2) *
              Math.cos(offset * 2.4)
            y += RIPPLE_HEIGHT * scale * ring
            lift += 1.4 * ring
          }
        }

        const inv = 1 / z
        const px = cx + x * focal * inv
        const py = horizon + (camH - y) * focal * inv
        // Nothing above the water line, whatever the dent or a ripple does.
        if (py < horizon) {
          bucket[i] = 255
          continue
        }
        const dx = px - cx
        const dy = py - cy
        const sx = cx + dx * cos - dy * sin
        const sy = cy + dx * sin + dy * cos
        if (
          sx < -margin ||
          sx > width + margin ||
          sy < -margin ||
          sy > height + margin
        ) {
          bucket[i] = 255
          continue
        }
        dotX[i] = sx
        dotY[i] = sy

        const crest = Math.max(-1, Math.min(1, lift))
        // Size and brightness both climb towards the viewer; a crest adds a
        // little of each.
        const radius = Math.max(
          0.5,
          Math.min(WAVE_MAX_RADIUS, 0.5 + near * 0.9 + crest * 0.25 * (0.3 + near)), // prettier-ignore
        )
        dotR[i] = radius
        const intensity = 0.12 + 0.75 * Math.sqrt(near) + 0.3 * crest
        const level = Math.max(
          0,
          Math.min(LEVELS - 1, Math.round(intensity * (LEVELS - 1))),
        )
        // Far and low leans amber, near and high leans light.
        const lean = toneSeed[i]! + 0.35 * near + 0.3 * crest
        const tone = lean < 0.45 ? 0 : lean < 0.95 ? 1 : 2
        const b = tone * LEVELS + level
        bucket[i] = b
        bucketCount[b] = bucketCount[b]! + 1
      }
    }

    // Counting sort into bucket order, so each bucket is one contiguous run.
    let start = 0
    for (let b = 0; b < BUCKETS; b += 1) {
      bucketStart[b] = start
      start += bucketCount[b]!
    }
    for (let d = 0; d < count; d += 1) {
      const b = bucket[d]!
      if (b === 255) continue
      order[bucketStart[b]!] = d
      bucketStart[b] = bucketStart[b]! + 1
    }

    ctx.clearRect(0, 0, width, height)
    let end = 0
    for (let b = 0; b < BUCKETS; b += 1) {
      const from = end
      end += bucketCount[b]!
      if (from === end) continue
      ctx.fillStyle = styles[b]!
      ctx.beginPath()
      for (let k = from; k < end; k += 1) {
        const d = order[k]!
        const x = dotX[d]!
        const y = dotY[d]!
        const r = dotR[d]!
        if (r < RECT_BELOW) {
          ctx.rect(x - r, y - r, r * 2, r * 2)
        } else {
          ctx.moveTo(x + r, y)
          ctx.arc(x, y, r, 0, TAU)
        }
      }
      ctx.fill()
    }
  }

  return {
    layout(size: SceneSize) {
      width = size.width
      height = size.height
      const cy = height / 2
      // The roll lifts one bottom corner by half the width times sin(roll),
      // so the nearest row starts that far under the bottom edge.
      bottom = height + (width / 2) * Math.sin(MAX_ROLL) + 6
      focal = height * (1 - HORIZON)
      // Each row spans the screen plus whatever the roll can swing in from
      // the sides, measured at the row furthest from the centre.
      const reach = Math.max(cy, bottom - cy) + height * MAX_PITCH
      halfSpan =
        (width / 2 + reach * Math.sin(MAX_ROLL)) / Math.cos(MAX_ROLL) + 8

      // Phone: about a third of the desktop dots.
      const spacingX = size.small ? 7.5 : 10.5
      const spacingY = size.small ? 17 : 13
      cols = Math.min(size.small ? 76 : 180, Math.ceil((halfSpan * 2) / spacingX)) // prettier-ignore
      rows = Math.min(
        size.small ? 34 : 52,
        Math.ceil((bottom - height * HORIZON) / spacingY),
      )
      count = cols * rows

      // Rows even in 1/z: from just under the horizon to the bottom edge, at
      // the neutral camera.
      const camH = (bottom - height * HORIZON) / focal
      const nearInv = 1
      const farInv = (FAR_ROW * (height - height * HORIZON)) / (camH * focal)
      rowZ = new Float64Array(rows)
      rowNear = new Float64Array(rows)
      rowClear = new Float64Array(rows)
      for (let row = 0; row < rows; row += 1) {
        const n = rows === 1 ? 1 : row / (rows - 1)
        const z = 1 / (farInv + (nearInv - farInv) * n)
        rowZ[row] = z
        rowNear[row] = n ** 1.15
        rowClear[row] = 1 / (1 + (z / CLEAR_Z) ** 2)
      }
      colU = new Float64Array(cols)
      for (let col = 0; col < cols; col += 1) {
        colU[col] = cols === 1 ? 0 : (col / (cols - 1)) * 2 - 1
      }

      jitter = new Float32Array(count)
      toneSeed = new Float32Array(count)
      dotX = new Float32Array(count)
      dotY = new Float32Array(count)
      dotR = new Float32Array(count)
      bucket = new Uint8Array(count)
      order = new Int32Array(count)
      const layoutRandom = seededRandom(0x5eed)
      const colStep = cols > 1 ? 2 / (cols - 1) : 0
      for (let d = 0; d < count; d += 1) {
        // A quarter of a column either way breaks up the moiré of a perfect
        // grid without letting two dots touch.
        jitter[d] = (layoutRandom() - 0.5) * 0.5 * colStep
        toneSeed[d] = layoutRandom() * 0.6
      }
      setCamera(neutral, 0, 0)
      setCamera(camera, roll, pitch)
    },

    draw(ctx, _size, step) {
      update(step)
      render(ctx, time, camera, true)
    },

    still(ctx) {
      // Reduced motion: the wave at t = 0, level, with no dent and no
      // ripples, and no internal state touched, so it is the same frame
      // every time.
      render(ctx, 0, neutral, false)
    },

    pointer(x, y) {
      pointerX = x
      pointerY = y
    },

    tilt(x, y, handheldDevice = true) {
      handheld = handheldDevice
      tiltX = x
      tiltY = y
    },

    jolt(strength) {
      if (rows === 0) return
      const amount = Math.max(0, Math.min(1, strength))
      // Somewhere in the near water, so the ripple is big enough to see.
      toWater(
        camera,
        width * (0.15 + 0.7 * random()),
        height * (0.72 + 0.22 * random()),
      )
      spawnRipple(hit.x, hit.z, 0.4 + 0.8 * amount)
    },
  }
}
