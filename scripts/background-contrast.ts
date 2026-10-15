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
  ACCENT_TEXT,
  BODY_TEXT,
  FIELD_ALPHA_IDLE_LOW,
  FIELD_ALPHA_PEAK,
  FIELD_RING_OVERLAP,
  FIELD_TONE_GAIN,
  FIELD_TONES,
  MAX_HIGHLIGHT_LUMINANCE,
  MIN_VISIBLE_CONTRAST,
  PAGE_BASE,
  composite,
  contrastRatio,
  relativeLuminance,
} from '../app/utils/backgrounds/palette'
import type { Rgb } from '../app/utils/backgrounds/palette'

const TONE_NAMES = ['amber', 'accent', 'light']

/**
 * Per tone: the faintest dash and the brightest. Then the worst overlap: on
 * the ring, a peak dash of one tone crossing a peak dash of another (or the
 * same tone in a different bucket), stacked {@link FIELD_RING_OVERLAP} deep.
 */
const rows: Array<{ label: string; colour: Rgb }> = []
FIELD_TONES.forEach((tone, i) => {
  const gain = FIELD_TONE_GAIN[i]!
  rows.push({ label: `field  ${TONE_NAMES[i]} faintest`, colour: composite(tone, FIELD_ALPHA_IDLE_LOW * gain) }) // prettier-ignore
  rows.push({ label: `field  ${TONE_NAMES[i]} peak`, colour: composite(tone, FIELD_ALPHA_PEAK * gain) }) // prettier-ignore
})
let worst: { label: string; colour: Rgb } | null = null
FIELD_TONES.forEach((under, i) => {
  FIELD_TONES.forEach((over, j) => {
    let colour: Rgb = composite(under, FIELD_ALPHA_PEAK * FIELD_TONE_GAIN[i]!)
    for (let k = 1; k < FIELD_RING_OVERLAP; k += 1) {
      colour = composite(over, FIELD_ALPHA_PEAK * FIELD_TONE_GAIN[j]!, colour)
    }
    if (!worst || relativeLuminance(colour) > relativeLuminance(worst.colour)) {
      worst = { label: `field  ring overlap ${TONE_NAMES[j]}/${TONE_NAMES[i]}`, colour } // prettier-ignore
    }
  })
})
if (worst) rows.push(worst)

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
