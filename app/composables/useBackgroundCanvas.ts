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
 *   - everything browser-side happens in `onMounted`, so nothing here runs on
 *     the server even if the component is ever rendered outside a `.client`
 *     boundary;
 *   - `prefers-reduced-motion: reduce` draws one still frame and never starts
 *     the loop, and the media query is watched so toggling it takes effect;
 *   - the loop stops when the tab is hidden and when the canvas leaves the
 *     viewport, and restarts when either comes back;
 *   - the backing store is capped, harder on small screens, and the scene is
 *     told it is small so it can cut its own work;
 *   - the frame step is clamped, so coming back from a hidden tab resumes
 *     instead of fast-forwarding.
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

  onMounted(() => {
    const el = canvas.value
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return

    const scene = createScene()
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

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

    document.addEventListener('visibilitychange', sync)
    reducedMotion.addEventListener('change', sync)
    if (scene.pointer) {
      window.addEventListener('pointermove', onPointerMove, { passive: true })
      document.addEventListener('pointerleave', clearPointer)
      window.addEventListener('blur', clearPointer)
    }

    measure()
    sync()

    onBeforeUnmount(() => {
      stop()
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      document.removeEventListener('visibilitychange', sync)
      reducedMotion.removeEventListener('change', sync)
      if (scene.pointer) {
        window.removeEventListener('pointermove', onPointerMove)
        document.removeEventListener('pointerleave', clearPointer)
        window.removeEventListener('blur', clearPointer)
      }
    })
  })

  return { canvas }
}
