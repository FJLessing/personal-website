// Print cv/cv.html to public/fj-lessing-cv.pdf, the CV the site links to.
//
// Needs the container-local browser from scripts/install-headless-browser.sh:
//
//   npm run cv:build
//   npm run cv:build -- --shots .tmp/cv   # also save a PNG of each page
//
// Fails if any page's content runs past the bottom of its page, so an edit
// that pushes text onto a third page is caught here, not by a reader.

import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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

const { chromium } = createRequire(`${home}/driver/`)('playwright-core')

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

const shotsArg = process.argv.indexOf('--shots')
const shotsDir =
  shotsArg === -1 ? null : path.resolve(process.argv[shotsArg + 1] ?? '.tmp/cv')

const source = path.join(repoRoot, 'cv', 'cv.html')
const output = path.join(repoRoot, 'public', 'fj-lessing-cv.pdf')

// The layout is drawn at 924 px wide, the width the original design exported
// at. A4 is 210 mm, which Chromium treats as 793.7 CSS px.
const DESIGN_WIDTH = 924
const A4_WIDTH = (210 / 25.4) * 96

const browser = await chromium.launch({
  executablePath,
  env: browserEnv,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

try {
  const page = await browser.newPage({
    viewport: { width: DESIGN_WIDTH, height: 1308 },
  })
  await page.goto(pathToFileURL(source).href, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)

  const overflows = await page.$$eval('.page', (pages) =>
    pages
      .map((el, i) => {
        const bottom = el.getBoundingClientRect().bottom
        const deepest = Math.max(
          ...[...el.querySelectorAll('*')].map(
            (child) => child.getBoundingClientRect().bottom,
          ),
        )
        return { page: i + 1, over: Math.ceil(deepest - bottom) }
      })
      .filter((p) => p.over > 0),
  )
  if (overflows.length) {
    for (const o of overflows)
      console.error(`page ${o.page}: content runs ${o.over}px past the bottom`)
    process.exitCode = 1
  }

  if (shotsDir) {
    await mkdir(shotsDir, { recursive: true })
    const pages = await page.$$('.page')
    for (const [i, el] of pages.entries()) {
      const file = path.join(shotsDir, `cv-page-${i + 1}.png`)
      await el.screenshot({ path: file })
      console.log(file)
    }
  }

  await page.pdf({
    path: output,
    format: 'A4',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    scale: A4_WIDTH / DESIGN_WIDTH,
  })
  console.log(path.relative(repoRoot, output))
} finally {
  await browser.close()
}
