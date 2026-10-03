/**
 * Prints how visible each background's highlights are, and how much room they
 * leave the text on top. Run with `npm run bg:contrast`.
 *
 * Two columns matter. "vs backdrop" is whether you can see the thing at all —
 * under about 1.1:1 a one-pixel line vanishes into 8-bit quantisation. "white"
 * and "yellow" are the WCAG AA ratios for text sitting directly on the
 * brightest pixel the layer draws; yellow-500 on amber is the tightest pairing
 * on the page, so it is the one that sets the ceiling.
 */
import {
  ACCENT,
  ACCENT_HOT,
  ACCENT_TEXT,
  ACCENT_WARM,
  AURORA_ALPHA_ONE,
  AURORA_ALPHA_THREE,
  AURORA_ALPHA_TWO,
  AURORA_GRAIN_ALPHA,
  BODY_TEXT,
  CONTOUR_ALPHA_HIGH,
  CONTOUR_ALPHA_LOW,
  GLYPH_ALPHA_HOT,
  GLYPH_ALPHA_PEAK,
  GLYPH_STILL_ALPHA_HIGH,
  GLYPH_STILL_ALPHA_LOW,
  MAX_HIGHLIGHT_LUMINANCE,
  MIN_VISIBLE_CONTRAST,
  PAGE_BASE,
  composite,
  contrastRatio,
  relativeLuminance,
} from '../app/utils/backgrounds/palette'
import type { Rgb } from '../app/utils/backgrounds/palette'

const WHITE: Rgb = [255, 255, 255]

const rows: Array<{ label: string; colour: Rgb }> = [
  { label: 'contour  faintest isoline', colour: composite(ACCENT, CONTOUR_ALPHA_LOW) }, // prettier-ignore
  { label: 'contour  brightest isoline', colour: composite(ACCENT, CONTOUR_ALPHA_HIGH) }, // prettier-ignore
  { label: 'glyphs   glyph at full power', colour: composite(ACCENT, GLYPH_ALPHA_PEAK) }, // prettier-ignore
  { label: 'glyphs   glyph under the cursor', colour: composite(ACCENT_HOT, GLYPH_ALPHA_HOT) }, // prettier-ignore
  { label: 'glyphs   still frame, dimmest', colour: composite(ACCENT, GLYPH_STILL_ALPHA_LOW) }, // prettier-ignore
  { label: 'glyphs   still frame, brightest', colour: composite(ACCENT, GLYPH_STILL_ALPHA_HIGH) }, // prettier-ignore
  { label: 'aurora   gradient one', colour: composite(ACCENT, AURORA_ALPHA_ONE) }, // prettier-ignore
  { label: 'aurora   gradient two', colour: composite(ACCENT_WARM, AURORA_ALPHA_TWO) }, // prettier-ignore
  { label: 'aurora   gradient three', colour: composite(ACCENT_HOT, AURORA_ALPHA_THREE) }, // prettier-ignore
  { label: 'aurora   dot grid', colour: composite(WHITE, AURORA_GRAIN_ALPHA) }, // prettier-ignore
  {
    label: 'aurora   all three stacked',
    colour: composite(
      ACCENT_HOT,
      AURORA_ALPHA_THREE,
      composite(
        ACCENT_WARM,
        AURORA_ALPHA_TWO,
        composite(ACCENT, AURORA_ALPHA_ONE),
      ),
    ),
  },
]

const pad = (text: string, width: number) => text.padEnd(width)
const ratio = (value: number) => `${value.toFixed(2)}:1`.padStart(7)
const channels = (c: Rgb) => c.map((v) => Math.round(v)).join(',').padStart(11) // prettier-ignore

console.log(
  `backdrop rgb(${PAGE_BASE.join(',')})  ` +
    `floor ${MIN_VISIBLE_CONTRAST}:1 vs backdrop  ` +
    `ceiling L=${MAX_HIGHLIGHT_LUMINANCE} (14px yellow-500 stays at AA)\n`,
)
console.log(
  `${pad('layer', 32)}${pad('rgb', 12)}  ${pad('L', 7)}` +
    `  vs backdrop    white   yellow`,
)

let failures = 0
for (const { label, colour } of rows) {
  const luminance = relativeLuminance(colour)
  const visible = contrastRatio(colour, PAGE_BASE)
  const white = contrastRatio(BODY_TEXT, colour)
  const yellow = contrastRatio(ACCENT_TEXT, colour)
  const bad =
    visible < MIN_VISIBLE_CONTRAST ||
    luminance > MAX_HIGHLIGHT_LUMINANCE ||
    white < 4.5 ||
    yellow < 4.5
  if (bad) failures += 1
  console.log(
    `${pad(label, 32)}${channels(colour)}  ${luminance.toFixed(4)}` +
      `  ${ratio(visible)}  ${ratio(white)}  ${ratio(yellow)}` +
      `${bad ? '   <-- out of budget' : ''}`,
  )
}

if (failures > 0) {
  console.error(`\n${failures} layer(s) out of budget.`)
  process.exitCode = 1
}
