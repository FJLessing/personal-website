/**
 * Prints how visible the background's highlights are, and how much room they
 * leave the text on top. Run with `npm run bg:contrast`.
 *
 * Two columns matter. "vs backdrop" is whether you can see the thing at all.
 * Under about 1.1:1 a one-pixel line vanishes into 8-bit quantisation. "white"
 * and "yellow" are the WCAG AA ratios for text sitting directly on the
 * brightest pixel the layer draws; yellow-500 on amber is the tightest pairing
 * on the page, so it is the one that sets the ceiling.
 */
import {
  ACCENT,
  ACCENT_TEXT,
  BODY_TEXT,
  CONTOUR_ALPHA_HIGH,
  CONTOUR_ALPHA_LOW,
  MAX_HIGHLIGHT_LUMINANCE,
  MIN_VISIBLE_CONTRAST,
  PAGE_BASE,
  composite,
  contrastRatio,
  relativeLuminance,
} from '../app/utils/backgrounds/palette'
import type { Rgb } from '../app/utils/backgrounds/palette'

const rows: Array<{ label: string; colour: Rgb }> = [
  { label: 'contour  faintest isoline', colour: composite(ACCENT, CONTOUR_ALPHA_LOW) }, // prettier-ignore
  { label: 'contour  brightest isoline', colour: composite(ACCENT, CONTOUR_ALPHA_HIGH) }, // prettier-ignore
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
