/**
 * Contract between the canvas runtime (`useBackgroundCanvas`) and a background
 * concept.
 *
 * A scene is a plain module, not a component. It never touches the DOM beyond
 * the 2D context it is handed, so every SSR-unsafe thing — `window`,
 * `document`, `requestAnimationFrame`, media queries — stays in the runtime,
 * and the scene itself can be driven from Node against a stub context to count
 * draw calls and measure frame cost.
 */

export interface SceneSize {
  /** Viewport width in CSS pixels. The context is pre-scaled, so draw in these. */
  width: number
  /** Viewport height in CSS pixels. */
  height: number
  /** Backing-store scale actually applied, after capping. */
  dpr: number
  /** Narrow viewport. Scenes must cut their work when this is true. */
  small: boolean
}

export interface BackgroundScene {
  /**
   * Rebuild viewport-dependent state. Runs once before the first frame and
   * again on every resize.
   */
  layout(size: SceneSize): void

  /**
   * Draw one frame. `step` is milliseconds since the previous drawn frame,
   * already clamped by the runtime so a long pause does not jump the scene.
   */
  draw(ctx: CanvasRenderingContext2D, size: SceneSize, step: number): void

  /**
   * The single frame drawn instead of animating under
   * `prefers-reduced-motion: reduce`. Must not advance any internal clock.
   */
  still(ctx: CanvasRenderingContext2D, size: SceneSize): void

  /**
   * Optional pointer hook. Defining it opts the scene into pointer tracking.
   * Coordinates are CSS pixels relative to the viewport; `null` means the
   * pointer left or the device is touch-only.
   */
  pointer?(x: number | null, y: number | null): void
}
