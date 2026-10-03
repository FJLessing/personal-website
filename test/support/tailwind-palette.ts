/**
 * Resolves Tailwind's default colour tokens to sRGB so a test can measure the
 * contrast the browser will actually paint.
 *
 * The values are read from the installed `tailwindcss/theme.css` rather than
 * copied into the test, so a Tailwind upgrade that moves a token is caught
 * instead of silently diverging from a hard-coded hex.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

import type { Rgb } from '~/utils/backgrounds/palette'

// Resolved from the project root: `import.meta.url` is not a file URL inside
// the Nuxt test environment.
const require = createRequire(resolve(process.cwd(), 'package.json'))

/** `--color-zinc-400: oklch(70.5% 0.015 286.067);` */
const OKLCH_TOKEN = /--color-([a-z]+-\d+):\s*oklch\(([^)]+)\)/g

/** `--color-black: #000;` — the two tokens Tailwind still writes as hex. */
const HEX_TOKEN = /--color-(black|white):\s*#([0-9a-f]{3,6})/g

/** sRGB transfer function. Linear light in, display value out. */
const encode = (channel: number) => {
  const clamped = Math.min(1, Math.max(0, channel))
  const encoded =
    clamped <= 0.0031308
      ? 12.92 * clamped
      : 1.055 * clamped ** (1 / 2.4) - 0.055
  return Math.round(encoded * 255)
}

/**
 * OKLCH to sRGB, via OKLab and linear sRGB. Coefficients are from the OKLab
 * definition (Björn Ottosson). Out-of-gamut channels are clamped, which is
 * what a browser does too.
 */
function oklchToRgb(lightness: number, chroma: number, hue: number): Rgb {
  const radians = (hue * Math.PI) / 180
  const a = chroma * Math.cos(radians)
  const b = chroma * Math.sin(radians)

  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3

  return [
    encode(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    encode(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    encode(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

/** Every `--color-*` token in Tailwind's default theme, as sRGB. */
export const TAILWIND_COLOURS: ReadonlyMap<string, Rgb> = (() => {
  const theme = readFileSync(require.resolve('tailwindcss/theme.css'), 'utf8')
  const colours = new Map<string, Rgb>()

  for (const [, name, digits] of theme.matchAll(HEX_TOKEN)) {
    const full =
      digits!.length === 3
        ? digits!.replace(/./g, (digit) => digit + digit)
        : digits!
    colours.set(name!, [
      Number.parseInt(full.slice(0, 2), 16),
      Number.parseInt(full.slice(2, 4), 16),
      Number.parseInt(full.slice(4, 6), 16),
    ])
  }

  for (const [, name, components] of theme.matchAll(OKLCH_TOKEN)) {
    const [lightness, chroma, hue] = components!.trim().split(/\s+/)
    colours.set(
      name!,
      oklchToRgb(
        Number.parseFloat(lightness!) / 100,
        Number.parseFloat(chroma!),
        // `oklch(98.5% 0 none)`: no hue, which at zero chroma is grey anyway.
        Number.parseFloat(hue!) || 0,
      ),
    )
  }

  return colours
})()

/** Looks up a Tailwind colour name, e.g. `zinc-400`. Throws if unknown. */
export function colour(name: string): Rgb {
  const value = TAILWIND_COLOURS.get(name)
  if (!value) throw new Error(`No Tailwind colour token named "${name}"`)
  return value
}
