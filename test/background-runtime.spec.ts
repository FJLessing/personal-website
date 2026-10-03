import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h } from 'vue'
import { useBackgroundCanvas } from '~/composables/useBackgroundCanvas'
import type { BackgroundScene, SceneSize } from '~/utils/backgrounds/scene'

/**
 * The hard requirements that are not about what the background looks like —
 * reduced motion, pausing when hidden or off-screen, capping the backing store
 * on a phone — all live in `useBackgroundCanvas`. They are also the ones most
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
}

function createHarness({ width, height, devicePixelRatio }: Viewport) {
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
const PHONE: Viewport = { width: 360, height: 740, devicePixelRatio: 3 }

/** Mounts a component that does nothing but run the composable. */
function mountCanvas(scene: BackgroundScene) {
  return mountSuspended(
    defineComponent({
      setup() {
        const { canvas } = useBackgroundCanvas(() => scene, {
          fps: 24,
          smallFps: 15,
        })
        return () => h('canvas', { ref: canvas })
      },
    }),
  )
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
      // still dropped — at the desktop rate it would have been drawn.
      harness.tick(10)
      expect(harness.frames()).toBe(1)
      harness.tick(50)
      expect(harness.frames()).toBe(1)
      harness.tick(80)
      expect(harness.frames()).toBe(2)
    })
  })
})
