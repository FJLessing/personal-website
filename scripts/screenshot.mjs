// Render a URL at the viewport widths this project cares about and report what
// the browser saw: console errors, uncaught exceptions, failed requests,
// Vue hydration mismatches, and any horizontal overflow.
//
// Needs the container-local browser from scripts/install-headless-browser.sh:
//
//   npm run screenshot -- http://127.0.0.1:3000/ --label home
//
// Exits non-zero when the page reports an error or a viewport overflows, so it
// can stand in for a human eyeballing three window sizes.

import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const home =
  process.env.HEADLESS_BROWSER_HOME ||
  path.join(path.dirname(repoRoot), '.tools', 'headless-browser')

if (!existsSync(path.join(home, 'driver', 'node_modules', 'playwright-core'))) {
  console.error(
    `No headless browser at ${home}\nRun: scripts/install-headless-browser.sh`,
  )
  process.exit(2)
}

// playwright-core lives outside this package on purpose, so a bare import would
// not resolve. Anchor the resolution at the driver directory instead.
const { chromium } = createRequire(`${home}/driver/`)('playwright-core')

// Chromium's shared libraries are unpacked into a private sysroot, so the
// browser process needs its own loader and fontconfig paths. Setting them on
// the child here means callers do not have to source env.sh first.
const sysroot = path.join(home, 'sysroot')
const browserEnv = {
  ...process.env,
  LD_LIBRARY_PATH: [
    path.join(sysroot, 'usr/lib/x86_64-linux-gnu'),
    path.join(sysroot, 'lib/x86_64-linux-gnu'),
    process.env.LD_LIBRARY_PATH,
  ]
    .filter(Boolean)
    .join(':'),
  FONTCONFIG_PATH: path.join(sysroot, 'etc/fonts'),
  XDG_DATA_DIRS: `${path.join(sysroot, 'usr/share')}:${process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share'}`,
}

// The build directory carries Playwright's revision number, e.g. chromium-1243.
const browsersDir = path.join(home, 'browsers')
const executablePath = (existsSync(browsersDir) ? readdirSync(browsersDir) : [])
  .filter((d) => d.startsWith('chromium-'))
  .map((d) => path.join(browsersDir, d, 'chrome-linux64', 'chrome'))
  .find((p) => existsSync(p))

if (!executablePath) {
  console.error(
    `No Chromium build under ${home}/browsers\nRun: scripts/install-headless-browser.sh`,
  )
  process.exit(2)
}

const opts = {
  out: '.tmp/shots',
  widths: '360,768,1440',
  wait: null,
  label: 'page',
}
const positional = []
for (const arg of process.argv.slice(2)) {
  const named = /^--([\w-]+)=(.*)$/.exec(arg)
  if (named) opts[named[1]] = named[2]
  else if (arg.startsWith('--')) opts[`__pending`] = arg.slice(2)
  else if (opts.__pending) {
    opts[opts.__pending] = arg
    delete opts.__pending
  } else positional.push(arg)
}

const url = positional[0]
if (!url) {
  console.error(
    'usage: node scripts/screenshot.mjs <url> [--out dir] [--widths 360,768,1440] [--wait selector] [--label name]',
  )
  process.exit(2)
}

const outDir = path.resolve(opts.out)
const widths = String(opts.widths)
  .split(',')
  .map((w) => Number(w.trim()))
const waitFor = opts.wait
const label = opts.label

await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({
  executablePath,
  env: browserEnv,
  // No user namespaces in this container, and nothing here is untrusted input.
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
let failed = false

for (const width of widths) {
  const problems = []
  const consoleMessages = []
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
    // Keep renders deterministic between runs.
    reducedMotion: 'reduce',
  })
  const page = await context.newPage()

  page.on('console', (msg) => {
    const type = msg.type()
    if (type === 'error' || type === 'warning') {
      consoleMessages.push({ type, text: msg.text(), url: msg.location()?.url })
    }
  })
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`))
  page.on('requestfailed', (req) =>
    problems.push(`requestfailed: ${req.url()} (${req.failure()?.errorText})`),
  )

  const response = await page.goto(url, { waitUntil: 'networkidle' })
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 10_000 })
  await page.evaluate(() => document.fonts.ready)

  // Chromium logs the document's own non-2xx status to the console. When the
  // page under test *is* an error page, that entry is the thing we asked for,
  // not a defect, so drop it and keep everything else.
  const selfStatus = `status of ${response?.status()}`
  for (const msg of consoleMessages) {
    if (
      !response?.ok() &&
      msg.text.includes(selfStatus) &&
      msg.url === response?.url()
    )
      continue
    problems.push(`console.${msg.type}: ${msg.text}`)
  }

  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    title: document.title,
    // A font that failed to load leaves zero-width glyphs behind.
    sampleTextWidth: (() => {
      const probe = document.createElement('span')
      probe.textContent = 'Hamburgefonstiv'
      probe.style.cssText =
        'position:absolute;visibility:hidden;white-space:nowrap'
      document.body.append(probe)
      const w = probe.getBoundingClientRect().width
      probe.remove()
      return Math.round(w)
    })(),
  }))

  // 1px of slack: sub-pixel layout rounding is not an overflow.
  const overflow = metrics.scrollWidth - metrics.clientWidth
  if (overflow > 1)
    problems.push(
      `horizontal overflow: ${overflow}px past the ${width}px viewport`,
    )
  if (metrics.sampleTextWidth === 0)
    problems.push('text measured 0px wide, no font was available')
  if (response && !response.ok() && response.status() < 400)
    problems.push(`unexpected status ${response.status()}`)

  const file = path.join(outDir, `${label}-${width}.png`)
  await page.screenshot({ path: file, fullPage: true })

  console.log(`\n${width}px, HTTP ${response?.status()}, "${metrics.title}"`)
  console.log(
    `  page height ${metrics.scrollHeight}px, text probe ${metrics.sampleTextWidth}px wide`,
  )
  console.log(`  ${path.relative(process.cwd(), file)}`)
  if (problems.length === 0) {
    console.log('  clean: no console errors, no overflow')
  } else {
    failed = true
    for (const p of problems) console.log(`  PROBLEM ${p}`)
  }

  await context.close()
}

await browser.close()
console.log(
  failed ? '\nFAIL: see PROBLEM lines above' : '\nOK: all viewports clean',
)
process.exit(failed ? 1 : 0)
