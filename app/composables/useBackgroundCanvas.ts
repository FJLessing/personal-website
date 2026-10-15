import type { BackgroundScene, SceneSize } from '~/utils/backgrounds/scene'

export interface BackgroundCanvasOptions {
  /** Target frames per second. The loop drops rAF callbacks to hold this. */
  fps?: number
  /** Target frames per second on a narrow viewport. */
  smallFps?: number
  /** Cap on `devicePixelRatio`. A background does not need a 3x backing store. */
  maxDpr?: number
  /** Cap on `devicePixelRatio` on a narrow viewport. */
  smallMaxDpr?: number
  /** Viewport width in CSS pixels at or below which `SceneSize.small` is true. */
  smallBreakpoint?: number
}

/**
 * Runs a {@link BackgroundScene} on a canvas, and owns every rule the
 * background has to obey:
 *
 *   - everything browser-side starts when the `<canvas>` element exists, so
 *     nothing here runs on the server even if the component is ever rendered
 *     outside a `.client` boundary (see `start` below for why that is not
 *     simply `onMounted`);
 *   - `prefers-reduced-motion: reduce` draws one still frame and never starts
 *     the loop, and the media query is watched so toggling it takes effect;
 *   - the loop stops when the tab is hidden and when the canvas leaves the
 *     viewport, and restarts when either comes back;
 *   - the backing store is capped, harder on small screens, and the scene is
 *     told it is small so it can cut its own work;
 *   - the frame step is clamped, so coming back from a hidden tab resumes
 *     instead of fast-forwarding;
 *   - device tilt and motion are only listened to on a coarse pointer, with
 *     reduced motion off, for a scene that asks for them, and the iOS
 *     permission prompt is only ever raised from the user's first gesture.
 *
 * The caller binds the returned ref to its `<canvas>` and does nothing else.
 */
export function useBackgroundCanvas(
  createScene: () => BackgroundScene,
  options: BackgroundCanvasOptions = {},
) {
  const {
    fps = 30,
    smallFps = 20,
    maxDpr = 2,
    smallMaxDpr = 1.5,
    smallBreakpoint = 640,
  } = options

  const canvas = ref<HTMLCanvasElement | null>(null)

  /** Runs the scene on `el` and returns the teardown. */
  const start = (el: HTMLCanvasElement): (() => void) => {
    const ctx = el.getContext('2d')
    if (!ctx) return () => {}

    const scene = createScene()
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const coarsePointer = window.matchMedia('(pointer: coarse)')

    let size: SceneSize = { width: 0, height: 0, dpr: 0, small: false }
    let handle = 0
    let lastFrame = 0
    let onScreen = true
    let resizeQueued = false

    const frameInterval = () => 1000 / (size.small ? smallFps : fps)

    /** Returns true when the canvas was resized and the scene re-laid out. */
    const measure = (): boolean => {
      const width = Math.max(1, el.clientWidth)
      const height = Math.max(1, el.clientHeight)
      const small = width <= smallBreakpoint
      const dpr = Math.min(
        window.devicePixelRatio || 1,
        small ? smallMaxDpr : maxDpr,
      )
      if (
        width === size.width &&
        height === size.height &&
        dpr === size.dpr &&
        small === size.small
      ) {
        return false
      }
      size = { width, height, dpr, small }
      el.width = Math.round(width * dpr)
      el.height = Math.round(height * dpr)
      // Scenes draw in CSS pixels; the backing-store scale lives here only.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      scene.layout(size)
      return true
    }

    const loop = (now: number) => {
      handle = requestAnimationFrame(loop)
      const elapsed = now - lastFrame
      if (elapsed < frameInterval()) return
      lastFrame = now
      // Three frames' worth at the slowest rate. Anything longer is a pause,
      // not a slow frame, and should not be integrated.
      scene.draw(ctx, size, Math.min(elapsed, 150))
    }

    const shouldRun = () =>
      !reducedMotion.matches &&
      onScreen &&
      document.visibilityState === 'visible'

    const stop = () => {
      if (!handle) return
      cancelAnimationFrame(handle)
      handle = 0
    }

    const sync = () => {
      if (shouldRun()) {
        if (handle) return
        lastFrame = performance.now() - frameInterval()
        handle = requestAnimationFrame(loop)
        return
      }
      stop()
      // A hidden tab keeps whatever was last painted. Reduced motion is a
      // different thing: it has to replace the animation with a still frame.
      if (reducedMotion.matches) scene.still(ctx, size)
    }

    const resizeObserver = new ResizeObserver(() => {
      // Coalesce the burst a drag-resize produces into one measure per frame.
      if (resizeQueued) return
      resizeQueued = true
      requestAnimationFrame(() => {
        resizeQueued = false
        if (measure() && !shouldRun() && reducedMotion.matches) {
          scene.still(ctx, size)
        }
      })
    })
    resizeObserver.observe(el)

    const intersectionObserver = new IntersectionObserver((entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting)
      sync()
    })
    intersectionObserver.observe(el)

    const onPointerMove = (event: PointerEvent) => {
      // Touch would pin the effect wherever the last tap landed, which reads
      // as a stuck cursor rather than as a response.
      if (event.pointerType === 'touch') return
      scene.pointer?.(event.clientX, event.clientY)
    }
    const clearPointer = () => scene.pointer?.(null, null)

    const sensors = createSensorBridge(scene)
    const syncSensors = () =>
      sensors.listen(coarsePointer.matches && !reducedMotion.matches)
    const onReducedMotion = () => {
      syncSensors()
      sync()
    }

    document.addEventListener('visibilitychange', sync)
    reducedMotion.addEventListener('change', onReducedMotion)
    coarsePointer.addEventListener('change', syncSensors)
    if (scene.pointer) {
      window.addEventListener('pointermove', onPointerMove, { passive: true })
      document.addEventListener('pointerleave', clearPointer)
      window.addEventListener('blur', clearPointer)
    }

    measure()
    syncSensors()
    sync()

    return () => {
      stop()
      sensors.listen(false)
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      document.removeEventListener('visibilitychange', sync)
      reducedMotion.removeEventListener('change', onReducedMotion)
      coarsePointer.removeEventListener('change', syncSensors)
      if (scene.pointer) {
        window.removeEventListener('pointermove', onPointerMove)
        document.removeEventListener('pointerleave', clearPointer)
        window.removeEventListener('blur', clearPointer)
      }
    }
  }

  /**
   * Starts on the canvas element, not on `onMounted`. A `.client` component
   * is wrapped by Nuxt's `createClientOnly`, which mounts it twice over: the
   * first pass renders an empty placeholder and fires the component's
   * `onMounted`, and only the re-render after that produces the real
   * template. An `onMounted` here sees no canvas, bails, and never retries,
   * so the background silently never draws. Watching the ref starts the
   * runtime whenever the element actually exists, however the component is
   * mounted. Non-immediate watchers never run during SSR.
   */
  watch(
    canvas,
    (el, _previous, onCleanup) => {
      if (el) onCleanup(start(el))
    },
    { flush: 'post' },
  )

  return { canvas }
}

/** Tilt, in degrees either way from the calibrated zero, that maps to ±1. */
const TILT_RANGE = 25
/** Time constant of the drifting zero point, in ms. */
const CALIBRATION_MS = 4000
/** Time constant of the tilt low-pass filter, in ms. */
const TILT_SMOOTHING_MS = 150
/** Time constant of the gravity estimate the jolt is measured against, in ms. */
const GRAVITY_MS = 250
/** High-passed acceleration, in m/s², below which nothing counts as a jolt. */
const JOLT_FLOOR = 1.5
/** High-passed acceleration above the floor that makes a full-strength jolt. */
const JOLT_RANGE = 8
/** Shortest gap between two jolts, in ms, so a shake does not pump the springs. */
const JOLT_GAP_MS = 150

interface PermissionGated {
  requestPermission?: () => Promise<string>
}

/** `1 - e^(-dt/tau)`: the frame-rate-independent blend for a low-pass. */
const blend = (dt: number, tau: number) => 1 - Math.exp(-Math.max(0, dt) / tau)

const clamp = (value: number) => Math.max(-1, Math.min(1, value))

/**
 * Turns `deviceorientation` and `devicemotion` into the scene's `tilt` and
 * `jolt` hooks: rotated to the screen, calibrated, clamped and filtered, so
 * the scene only ever sees clean -1..1 and 0..1 values and stays testable in
 * Node. `listen(true)` attaches, `listen(false)` detaches; both are idempotent.
 */
function createSensorBridge(scene: BackgroundScene) {
  const wanted = Boolean(scene.tilt || scene.jolt)
  let listening = false
  let permissionAsked = false

  // Tilt state, in screen-aligned degrees.
  let zeroX = 0
  let zeroY = 0
  let tiltX = 0
  let tiltY = 0
  let lastTilt: number | null = null

  // Motion state, in m/s².
  let gravityX = 0
  let gravityY = 0
  let gravityZ = 0
  let lastMotion: number | null = null
  let lastJolt = -Infinity

  const onOrientation = (event: DeviceOrientationEvent) => {
    if (event.beta == null || event.gamma == null) return
    // Rotate (gamma, beta) by the screen angle, so landscape tilts the same
    // way on screen as portrait does.
    // `screen.orientation` is missing before iOS 16.4; the old
    // `window.orientation` carries the same angle there.
    const degrees =
      window.screen?.orientation?.angle ??
      (window as { orientation?: number }).orientation ??
      0
    const angle = (degrees * Math.PI) / 180
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const x = event.gamma * cos + event.beta * sin
    const y = event.beta * cos - event.gamma * sin

    const now = performance.now()
    if (lastTilt === null) {
      // The first reading is how the device is being held: call that zero.
      zeroX = x
      zeroY = y
      tiltX = 0
      tiltY = 0
    } else {
      const dt = now - lastTilt
      // The zero drifts towards the current angle, so the field answers
      // changes in tilt rather than the angle the phone happens to rest at.
      const drift = blend(dt, CALIBRATION_MS)
      zeroX += (x - zeroX) * drift
      zeroY += (y - zeroY) * drift
      const smooth = blend(dt, TILT_SMOOTHING_MS)
      tiltX += (clamp((x - zeroX) / TILT_RANGE) - tiltX) * smooth
      tiltY += (clamp((y - zeroY) / TILT_RANGE) - tiltY) * smooth
    }
    lastTilt = now
    scene.tilt?.(tiltX, tiltY)
  }

  const onMotion = (event: DeviceMotionEvent) => {
    const source =
      event.acceleration?.x != null
        ? event.acceleration
        : event.accelerationIncludingGravity
    if (source?.x == null || source.y == null || source.z == null) return
    const now = performance.now()
    if (lastMotion === null) {
      gravityX = source.x
      gravityY = source.y
      gravityZ = source.z
      lastMotion = now
      return
    }
    // High-pass: subtract a slow estimate of the steady part (gravity, or a
    // steady push), so only a sudden change counts.
    const k = blend(now - lastMotion, GRAVITY_MS)
    lastMotion = now
    gravityX += (source.x - gravityX) * k
    gravityY += (source.y - gravityY) * k
    gravityZ += (source.z - gravityZ) * k
    const size = Math.hypot(
      source.x - gravityX,
      source.y - gravityY,
      source.z - gravityZ,
    )
    if (size <= JOLT_FLOOR || now - lastJolt < JOLT_GAP_MS) return
    lastJolt = now
    scene.jolt?.(Math.min(1, (size - JOLT_FLOOR) / JOLT_RANGE))
  }

  const gated = (): PermissionGated[] =>
    [
      typeof DeviceOrientationEvent === 'undefined'
        ? undefined
        : (DeviceOrientationEvent as unknown as PermissionGated),
      typeof DeviceMotionEvent === 'undefined'
        ? undefined
        : (DeviceMotionEvent as unknown as PermissionGated),
    ].filter(
      (api): api is PermissionGated =>
        typeof api?.requestPermission === 'function',
    )

  /**
   * iOS 13+ only delivers sensor events after `requestPermission()`, which
   * must be called from a user gesture. So it is called once, from the first
   * tap or click, and never on load. A refusal changes nothing: the scene
   * keeps its idle motion.
   */
  const onFirstGesture = () => {
    removeGesture()
    if (permissionAsked) return
    permissionAsked = true
    for (const api of gated()) {
      api.requestPermission!().catch(() => {})
    }
  }
  const removeGesture = () => {
    window.removeEventListener('touchend', onFirstGesture, true)
    window.removeEventListener('click', onFirstGesture, true)
  }

  const listen = (on: boolean) => {
    const next = on && wanted
    if (next === listening) return
    listening = next
    if (next) {
      lastTilt = null
      lastMotion = null
      // Tell the scene it is on a handheld before any reading arrives.
      scene.tilt?.(null, null)
      if (scene.tilt)
        window.addEventListener('deviceorientation', onOrientation)
      if (scene.jolt) window.addEventListener('devicemotion', onMotion)
      if (!permissionAsked && gated().length > 0) {
        window.addEventListener('touchend', onFirstGesture, {
          capture: true,
          passive: true,
        })
        window.addEventListener('click', onFirstGesture, {
          capture: true,
          passive: true,
        })
      }
      return
    }
    window.removeEventListener('deviceorientation', onOrientation)
    window.removeEventListener('devicemotion', onMotion)
    removeGesture()
    // Drop the last reading, so no parallax is left frozen in place.
    scene.tilt?.(null, null)
  }

  return { listen }
}
