import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h } from 'vue'
import { createClientOnly } from '#app/components/client-only'
import { useBackgroundCanvas } from '~/composables/useBackgroundCanvas'
import type { BackgroundScene, SceneSize } from '~/utils/backgrounds/scene'

/**
 * The hard requirements that are not about what the background looks like
 * (reduced motion, pausing when hidden or off-screen, capping the backing
 * store on a phone) all live in `useBackgroundCanvas`. They are also the ones most
 * easily broken by a later edit and least likely to be noticed, because a
 * background that animates when it should not looks exactly like one that
 * works.
 *
 * So they are asserted here against stubbed browser APIs rather than left to
 * be eyeballed. The scene is a counter; what is under test is the runtime's
 * decision about whether to run at all.
 */

interface Viewport {
  width: number
  height: number
  devicePixelRatio: number
  /** `(pointer: coarse)`: a phone or tablet. */
  coarse?: boolean
}

function createHarness({
  width,
  height,
  devicePixelRatio,
  coarse = false,
}: Viewport) {
  let frames = 0
  let stills = 0
  const steps: number[] = []
  let layout: SceneSize | null = null

  let reduced = false
  let visibility: 'visible' | 'hidden' = 'visible'
  let pending: FrameRequestCallback | null = null
  let rafRequests = 0
  let nextHandle = 1
  // The runtime seeds `lastFrame` from `performance.now()`, so the clock the
  // test drives and the timestamps it hands the loop have to be the same one.
  let clock = 0

  const mediaListeners = new Set<() => void>()
  const visibilityListeners = new Set<() => void>()
  let intersectionCallback: IntersectionObserverCallback | null = null

  const scene: BackgroundScene = {
    layout(size) {
      layout = { ...size }
    },
    draw(_ctx, _size, step) {
      frames += 1
      steps.push(step)
    },
    still() {
      stills += 1
    },
  }

  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafRequests += 1
    pending = cb
    return nextHandle++
  })
  vi.stubGlobal('cancelAnimationFrame', () => {
    pending = null
  })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: IntersectionObserverCallback) {
        intersectionCallback = cb
      }
      observe() {}
      disconnect() {}
    },
  )

  Object.defineProperty(window, 'devicePixelRatio', {
    configurable: true,
    value: devicePixelRatio,
  })
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      media: query,
      get matches() {
        if (query.includes('pointer: coarse')) return coarse
        return query.includes('prefers-reduced-motion') && reduced
      },
      addEventListener: (_: string, fn: () => void) => mediaListeners.add(fn),
      removeEventListener: (_: string, fn: () => void) =>
        mediaListeners.delete(fn),
    }),
  })
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  })

  const realAdd = document.addEventListener.bind(document)
  vi.spyOn(document, 'addEventListener').mockImplementation((type, fn) => {
    if (type === 'visibilitychange') {
      visibilityListeners.add(fn as () => void)
      return
    }
    realAdd(type, fn)
  })

  // A canvas has no layout in happy-dom, so the runtime would measure 0x0 and
  // never exercise the small-screen cap. Give it the viewport under test, and
  // a context stub, since `getContext` otherwise returns null and the runtime
  // correctly bails before doing anything.
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => width,
  })
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => height,
  })
  HTMLCanvasElement.prototype.getContext = (() => ({
    setTransform: () => {},
  })) as unknown as HTMLCanvasElement['getContext']

  return {
    scene,
    /** Advances the clock and fires the pending rAF callback, if there is one. */
    tick: (now: number) => {
      clock = now
      const cb = pending
      pending = null
      cb?.(now)
    },
    frames: () => frames,
    stills: () => stills,
    steps: () => steps,
    rafRequests: () => rafRequests,
    /** The `SceneSize` the runtime handed the scene on its last layout. */
    layout: () => layout,
    /** Drives the `(prefers-reduced-motion: reduce)` media query. */
    setReducedMotion: (value: boolean) => {
      reduced = value
      for (const fn of mediaListeners) fn()
    },
    /** Drives the `(pointer: coarse)` media query: a keyboard and trackpad attached. */
    setCoarse: (value: boolean) => {
      coarse = value
      for (const fn of mediaListeners) fn()
    },
    setVisibility: (value: 'visible' | 'hidden') => {
      visibility = value
      for (const fn of visibilityListeners) fn()
    },
    setIntersecting: (value: boolean) => {
      intersectionCallback?.(
        [{ isIntersecting: value } as IntersectionObserverEntry],
        null as unknown as IntersectionObserver,
      )
    },
  }
}

type Harness = ReturnType<typeof createHarness>

const DESKTOP: Viewport = { width: 1440, height: 900, devicePixelRatio: 3 }
const PHONE: Viewport = {
  width: 360,
  height: 740,
  devicePixelRatio: 3,
  coarse: true,
}

/** A component that does nothing but run the composable. */
const canvasComponent = (scene: BackgroundScene) =>
  defineComponent({
    setup() {
      const { canvas } = useBackgroundCanvas(() => scene, {
        fps: 24,
        smallFps: 15,
      })
      return () => h('canvas', { ref: canvas })
    },
  })

function mountCanvas(scene: BackgroundScene) {
  return mountSuspended(canvasComponent(scene))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('background canvas runtime', () => {
  let harness: Harness

  describe('on a desktop viewport', () => {
    beforeEach(() => {
      harness = createHarness(DESKTOP)
    })

    it('holds the requested frame rate, dropping the rAF callbacks between', async () => {
      await mountCanvas(harness.scene)

      // 24fps is a ~41.7ms interval. The first frame is due immediately; the
      // one 16ms later is dropped, the one 64ms after that is not.
      harness.tick(16)
      expect(harness.frames()).toBe(1)
      harness.tick(32)
      expect(harness.frames()).toBe(1)
      harness.tick(80)
      expect(harness.frames()).toBe(2)
    })

    it('caps the backing store below the device pixel ratio', async () => {
      await mountCanvas(harness.scene)

      expect(harness.layout()?.small).toBe(false)
      // 2x against a 3x device: a decoration does not need a 3x backing store.
      expect(harness.layout()?.dpr).toBe(2)
    })

    it('stops when the tab is hidden and resumes when it comes back', async () => {
      await mountCanvas(harness.scene)
      harness.tick(100)
      const before = harness.frames()

      harness.setVisibility('hidden')
      const requestsWhenHidden = harness.rafRequests()
      harness.tick(200)
      expect(harness.frames()).toBe(before)
      // Nothing is left scheduled, so the loop is genuinely stopped rather
      // than spinning and discarding frames.
      expect(harness.rafRequests()).toBe(requestsWhenHidden)
      // A hidden tab keeps its last painted frame; it does not get a still.
      expect(harness.stills()).toBe(0)

      harness.setVisibility('visible')
      harness.tick(300)
      expect(harness.frames()).toBeGreaterThan(before)
    })

    it('stops when the canvas scrolls off-screen', async () => {
      await mountCanvas(harness.scene)
      harness.tick(100)
      const before = harness.frames()

      harness.setIntersecting(false)
      harness.tick(200)
      expect(harness.frames()).toBe(before)

      harness.setIntersecting(true)
      harness.tick(300)
      expect(harness.frames()).toBeGreaterThan(before)
    })

    it('clamps the frame step, so a long pause does not fast-forward', async () => {
      await mountCanvas(harness.scene)
      harness.tick(100)
      harness.tick(100_000)

      expect(Math.max(...harness.steps())).toBeLessThanOrEqual(150)
    })

    it('stops the loop when the component unmounts', async () => {
      const wrapper = await mountCanvas(harness.scene)
      harness.tick(100)
      const before = harness.frames()

      wrapper.unmount()
      harness.tick(200)
      expect(harness.frames()).toBe(before)
    })
  })

  describe('behind a .client boundary', () => {
    beforeEach(() => {
      harness = createHarness(DESKTOP)
    })

    // `SiteBackground.client.vue` is wrapped by Nuxt's `createClientOnly`.
    // While the page hydrates, which is every real page load, its first
    // mount renders a placeholder and fires `onMounted` before the canvas
    // exists. A runtime that started from `onMounted` saw no canvas, bailed,
    // and the live site shipped a background that never drew a pixel, with
    // no error anywhere. Mounting the bare component, or mounting the wrapper
    // outside hydration, renders the canvas on the first pass and cannot see
    // that.
    it('starts once the wrapper renders the real canvas', async () => {
      const nuxtApp = useNuxtApp()
      nuxtApp.isHydrating = true
      try {
        await mountSuspended(createClientOnly(canvasComponent(harness.scene)))
      } finally {
        nuxtApp.isHydrating = false
      }

      expect(harness.layout()).not.toBeNull()
      harness.tick(100)
      expect(harness.frames()).toBe(1)
    })
  })

  describe('under prefers-reduced-motion: reduce', () => {
    beforeEach(() => {
      harness = createHarness(DESKTOP)
    })

    it('never starts the loop and draws one still frame instead', async () => {
      harness.setReducedMotion(true)
      await mountCanvas(harness.scene)

      // Not a slower animation: no frame is ever requested at all.
      expect(harness.rafRequests()).toBe(0)
      expect(harness.frames()).toBe(0)
      expect(harness.stills()).toBe(1)
    })

    it('takes effect when the setting is turned on mid-session', async () => {
      await mountCanvas(harness.scene)
      harness.tick(100)
      expect(harness.frames()).toBeGreaterThan(0)
      const before = harness.frames()

      harness.setReducedMotion(true)
      harness.tick(200)
      expect(harness.frames()).toBe(before)
      expect(harness.stills()).toBe(1)
    })
  })

  describe('on a phone viewport', () => {
    beforeEach(() => {
      harness = createHarness(PHONE)
    })

    it('tells the scene it is small and caps the backing store harder', async () => {
      await mountCanvas(harness.scene)

      expect(harness.layout()?.small).toBe(true)
      // 1.5x on a phone rather than the 2x a desktop gets, against a 3x device.
      expect(harness.layout()?.dpr).toBe(1.5)
    })

    it('runs at the small-screen frame rate, not the desktop one', async () => {
      await mountCanvas(harness.scene)

      // 15fps is a ~66.7ms interval, so a frame 40ms after the last one is
      // still dropped, though at the desktop rate it would have been drawn.
      harness.tick(10)
      expect(harness.frames()).toBe(1)
      harness.tick(50)
      expect(harness.frames()).toBe(1)
      harness.tick(80)
      expect(harness.frames()).toBe(2)
    })
  })
})

/** A scene that asks for tilt and jolt, recording every call. */
function sensorScene(harness: Harness) {
  const tilt = vi.fn<(x: number | null, y: number | null) => void>()
  const jolt = vi.fn<(strength: number) => void>()
  return { scene: { ...harness.scene, tilt, jolt }, tilt, jolt }
}

/** Fires a `deviceorientation` at `now`, with the given angles in degrees. */
function orient(harness: Harness, now: number, gamma: number, beta: number) {
  harness.tick(now)
  const event = Object.assign(new Event('deviceorientation'), { gamma, beta })
  window.dispatchEvent(event)
}

/** Fires a `devicemotion` at `now`, gravity-free acceleration in m/s². */
function shake(harness: Harness, now: number, x: number, y: number, z: number) {
  harness.tick(now)
  const event = Object.assign(new Event('devicemotion'), {
    acceleration: { x, y, z },
    accelerationIncludingGravity: null,
  })
  window.dispatchEvent(event)
}

/** Stubs the iOS 13+ permission gate on both sensor event constructors. */
function stubPermissionGate() {
  const orientation = vi.fn(() => Promise.resolve('granted'))
  const motion = vi.fn(() => Promise.resolve('granted'))
  vi.stubGlobal('DeviceOrientationEvent', { requestPermission: orientation })
  vi.stubGlobal('DeviceMotionEvent', { requestPermission: motion })
  return { orientation, motion }
}

describe('background canvas sensors', () => {
  let harness: Harness

  it('does not listen on a fine pointer, even for a scene that wants tilt', async () => {
    harness = createHarness(DESKTOP)
    const { scene, tilt } = sensorScene(harness)
    const add = vi.spyOn(window, 'addEventListener')
    await mountCanvas(scene)

    const types = add.mock.calls.map(([type]) => type)
    expect(types).not.toContain('deviceorientation')
    expect(types).not.toContain('devicemotion')
    orient(harness, 50, 10, 40)
    expect(tilt).not.toHaveBeenCalled()
  })

  it('does not listen for a scene without tilt or jolt', async () => {
    harness = createHarness(PHONE)
    const add = vi.spyOn(window, 'addEventListener')
    await mountCanvas(harness.scene)

    const types = add.mock.calls.map(([type]) => type)
    expect(types).not.toContain('deviceorientation')
    expect(types).not.toContain('devicemotion')
  })

  it('listens on a coarse pointer and says so before any reading', async () => {
    harness = createHarness(PHONE)
    const { scene, tilt } = sensorScene(harness)
    const add = vi.spyOn(window, 'addEventListener')
    await mountCanvas(scene)

    const types = add.mock.calls.map(([type]) => type)
    expect(types).toContain('deviceorientation')
    expect(types).toContain('devicemotion')
    // The handheld signal, so the scene can wander with no input.
    expect(tilt).toHaveBeenCalledWith(null, null)
  })

  it('does not listen under reduced motion', async () => {
    harness = createHarness(PHONE)
    harness.setReducedMotion(true)
    const { scene, tilt } = sensorScene(harness)
    const add = vi.spyOn(window, 'addEventListener')
    await mountCanvas(scene)

    const types = add.mock.calls.map(([type]) => type)
    expect(types).not.toContain('deviceorientation')
    expect(types).not.toContain('devicemotion')
    orient(harness, 50, 10, 40)
    expect(tilt).not.toHaveBeenCalled()
  })

  it('stops listening when reduced motion is turned on mid-session', async () => {
    harness = createHarness(PHONE)
    const { scene, tilt } = sensorScene(harness)
    await mountCanvas(scene)
    harness.setReducedMotion(true)
    tilt.mockClear()

    orient(harness, 50, 10, 40)
    // Only the reset on detach, never a reading.
    expect(tilt.mock.calls.every(([x, y]) => x === null && y === null)).toBe(
      true,
    )
  })

  it('says it is no longer a handheld when the pointer turns fine', async () => {
    // A tablet that gets a keyboard and trackpad attached. The scene was told
    // "handheld" when listening started; detaching has to take that back, or
    // its idle motion keeps running under a real cursor.
    harness = createHarness(PHONE)
    const { scene, tilt } = sensorScene(harness)
    const remove = vi.spyOn(window, 'removeEventListener')
    await mountCanvas(scene)
    expect(tilt).toHaveBeenLastCalledWith(null, null)
    orient(harness, 50, 10, 40)
    tilt.mockClear()

    harness.setCoarse(false)
    expect(tilt).toHaveBeenCalledTimes(1)
    expect(tilt).toHaveBeenLastCalledWith(null, null, false)
    const types = remove.mock.calls.map(([type]) => type)
    expect(types).toContain('deviceorientation')
    expect(types).toContain('devicemotion')

    // And back again: a handheld once more, before any reading.
    harness.setCoarse(true)
    expect(tilt).toHaveBeenLastCalledWith(null, null)
  })

  it('removes every sensor listener on unmount', async () => {
    harness = createHarness(PHONE)
    const { scene, tilt, jolt } = sensorScene(harness)
    const wrapper = await mountCanvas(scene)
    wrapper.unmount()
    tilt.mockClear()

    orient(harness, 50, 10, 40)
    orient(harness, 70, 40, 40)
    shake(harness, 80, 0, 0, 0)
    shake(harness, 100, 30, 0, 0)
    expect(tilt.mock.calls.filter(([x]) => x !== null)).toHaveLength(0)
    expect(jolt).not.toHaveBeenCalled()
  })

  it('calibrates to the first reading, then clamps and filters', async () => {
    harness = createHarness(PHONE)
    const { scene, tilt } = sensorScene(harness)
    await mountCanvas(scene)

    // Held at 40 degrees towards the user: that is zero, not a tilt.
    orient(harness, 100, 0, 40)
    expect(tilt).toHaveBeenLastCalledWith(0, 0)

    // A 60-degree roll to the right is past the 25-degree range. Filtered,
    // it ramps up rather than jumping, and it never goes past 1.
    orient(harness, 116, 60, 40)
    const firstStep = tilt.mock.lastCall![0]!
    expect(firstStep).toBeGreaterThan(0)
    expect(firstStep).toBeLessThan(0.5)
    for (let t = 132; t < 1000; t += 16) orient(harness, t, 60, 40)
    const [x, y] = tilt.mock.lastCall!
    expect(x).toBeGreaterThan(0.9)
    expect(x).toBeLessThanOrEqual(1)
    expect(y).toBeCloseTo(0, 5)

    // Held there, the zero catches up and the tilt drifts back to rest.
    for (let t = 1000; t < 30_000; t += 100) orient(harness, t, 60, 40)
    expect(Math.abs(tilt.mock.lastCall![0]!)).toBeLessThan(0.05)
  })

  it('turns a sudden movement into a jolt, and ignores a steady one', async () => {
    harness = createHarness(PHONE)
    const { scene, jolt } = sensorScene(harness)
    await mountCanvas(scene)

    shake(harness, 100, 0, 0, 0)
    shake(harness, 116, 0.2, 0.1, 0)
    expect(jolt).not.toHaveBeenCalled()

    shake(harness, 132, 9, 0, 0)
    expect(jolt).toHaveBeenCalledOnce()
    const strength = jolt.mock.lastCall![0]!
    expect(strength).toBeGreaterThan(0)
    expect(strength).toBeLessThanOrEqual(1)
  })

  it('asks iOS for permission on the first gesture, never on mount, once', async () => {
    harness = createHarness(PHONE)
    const gate = stubPermissionGate()
    const { scene } = sensorScene(harness)
    await mountCanvas(scene)

    expect(gate.orientation).not.toHaveBeenCalled()
    expect(gate.motion).not.toHaveBeenCalled()

    window.dispatchEvent(new Event('touchend'))
    expect(gate.orientation).toHaveBeenCalledOnce()
    expect(gate.motion).toHaveBeenCalledOnce()

    window.dispatchEvent(new Event('touchend'))
    window.dispatchEvent(new Event('click'))
    expect(gate.orientation).toHaveBeenCalledOnce()
    expect(gate.motion).toHaveBeenCalledOnce()
  })

  it('carries on quietly when iOS permission is refused', async () => {
    harness = createHarness(PHONE)
    vi.stubGlobal('DeviceOrientationEvent', {
      requestPermission: () => Promise.reject(new Error('denied')),
    })
    vi.stubGlobal('DeviceMotionEvent', {
      requestPermission: () => Promise.resolve('denied'),
    })
    const { scene } = sensorScene(harness)
    await mountCanvas(scene)

    window.dispatchEvent(new Event('click'))
    await Promise.resolve()
    harness.tick(100)
    expect(harness.frames()).toBeGreaterThan(0)
  })
})
