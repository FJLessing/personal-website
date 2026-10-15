/**
 * Colour budget for the site background.
 *
 * The background is a translucent layer over one known opaque backdrop, so
 * "is it bright enough to see" and "is it dim enough to read text over" are
 * both arithmetic rather than taste. The numbers live here, in one place, and
 * `test/backgrounds.spec.ts` asserts both ends of the range so neither can
 * drift. `npm run bg:contrast` prints the same table.
 *
 * The two bounds:
 *
 *   - **Floor.** The faintest thing the background draws must clear
 *     {@link MIN_VISIBLE_CONTRAST} against the backdrop. Below roughly 1.1:1 a
 *     one-pixel line disappears into 8-bit quantisation and panel dither. It
 *     renders, but nobody sees it.
 *   - **Ceiling.** The brightest pixel the background draws must stay under
 *     {@link MAX_HIGHLIGHT_LUMINANCE}, which is where 14px yellow-500 text
 *     sitting directly on top of it still clears WCAG AA at 4.5:1. Yellow on
 *     amber is the tightest pairing on the page; white body copy has far more
 *     room.
 */

export type Rgb = readonly [number, number, number]

/**
 * The opaque page backdrop the backgrounds composite over. Must match the
 * `bg-[#0d0d0d]` base in `app/app.vue`; the contrast test is the enforcement.
 */
export const PAGE_BASE: Rgb = [13, 13, 13]

/** The site accent, borrowed rather than reinvented. */
export const ACCENT: Rgb = [240, 177, 0]

/** Body copy. */
export const BODY_TEXT: Rgb = [255, 255, 255]

/** Tailwind `yellow-500`: section labels, the name in the hero, link hovers. */
export const ACCENT_TEXT: Rgb = [234, 179, 8]

/** Smallest contrast ratio against the backdrop that actually reads as a mark. */
export const MIN_VISIBLE_CONTRAST = 1.1

/** Highest composited luminance any background pixel may reach. See above. */
export const MAX_HIGHLIGHT_LUMINANCE = 0.07

/**
 * Field dashes: the three tones. A deep amber, the accent itself and a light
 * yellow. Each dash keeps one tone for life, so the mix reads as texture
 * rather than as flicker.
 */
export const FIELD_AMBER: Rgb = [214, 120, 0]
export const FIELD_LIGHT: Rgb = [255, 216, 107]
export const FIELD_TONES: readonly Rgb[] = [FIELD_AMBER, ACCENT, FIELD_LIGHT]

/**
 * Per-tone alpha multiplier, so the three tones sit at roughly the same
 * luminance for the same intensity. Amber is dark and needs more alpha to be
 * seen; light yellow is bright and reaches the ceiling first.
 */
export const FIELD_TONE_GAIN: readonly number[] = [1.3, 1, 0.84]

/**
 * Field intensity before the per-tone gain. The idle field breathes between
 * the two idle values as a slow wave crosses it; dashes pushed onto the ring
 * around the influence point climb to the peak.
 */
export const FIELD_ALPHA_IDLE_LOW = 0.09
export const FIELD_ALPHA_IDLE_HIGH = 0.13
export const FIELD_ALPHA_PEAK = 0.19

/**
 * The alpha ladder the scene quantises to, one stroke per rung per tone. Four
 * rungs times three tones is the twelve-stroke ceiling.
 */
export const FIELD_ALPHA_LEVELS: readonly number[] = [
  FIELD_ALPHA_IDLE_LOW,
  FIELD_ALPHA_IDLE_HIGH,
  (FIELD_ALPHA_IDLE_HIGH + FIELD_ALPHA_PEAK) / 2,
  FIELD_ALPHA_PEAK,
]

/**
 * Overlap. Dashes in the same bucket share one path and one `stroke()`, and a
 * stroke fills the union of its path, so they never compound. Dashes from two
 * different buckets do. On the ring, where dashes bunch, two of the brightest
 * can cross, so the ceiling is checked against every pair of tones at the peak
 * stacked on each other, not against one dash alone.
 */
export const FIELD_RING_OVERLAP = 2

const channel = (value: number) => {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG 2.x contrast ratio, order-independent. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Source-over composite of `fg` at `alpha` onto `bg`. */
export function composite(fg: Rgb, alpha: number, bg: Rgb = PAGE_BASE): Rgb {
  return [
    bg[0] + (fg[0] - bg[0]) * alpha,
    bg[1] + (fg[1] - bg[1]) * alpha,
    bg[2] + (fg[2] - bg[2]) * alpha,
  ]
}

/** `rgba()` string for a canvas fill or stroke. */
export function rgba([r, g, b]: Rgb, alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`
}
