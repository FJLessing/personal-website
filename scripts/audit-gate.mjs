// Fail on any `npm audit` advisory that is not on the accepted list.
//
//   npm run audit:gate
//
// The full audit cannot reach zero while `braces` and `node-forge` have no
// fixed release (see README, "Dependency audit"), so a plain
// `npm audit --audit-level=low` would be red for good and nobody would read
// it. This keeps the gate honest instead: the two accepted advisories pass,
// anything new fails the build.
//
// `--include=dev` is explicit because `NODE_ENV=production` makes npm omit dev
// dependencies by default, which turns a "full" audit into `--omit=dev`
// without saying so.

import { spawnSync } from 'node:child_process'

// Advisory ID -> the package it is accepted for. Remove an entry once the
// advisory stops being reported; the gate warns when one goes stale.
const ACCEPTED = new Map([
  ['GHSA-vfj7-8cjw-p6xm', 'braces'],
  ['GHSA-86w9-cpqp-85rv', 'node-forge'],
])

const run = spawnSync('npm', ['audit', '--json', '--include=dev'], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})

let report
try {
  report = JSON.parse(run.stdout)
} catch {
  console.error('npm audit did not return JSON:\n' + run.stdout + run.stderr)
  process.exit(1)
}

if (report.error || !report.metadata) {
  console.error('npm audit failed:', JSON.stringify(report.error ?? report))
  process.exit(1)
}

// Only the leaf advisories carry an ID; parents just list the package they
// depend on, and are covered once their leaf is accounted for.
const found = new Map()
for (const [pkg, vuln] of Object.entries(report.vulnerabilities)) {
  for (const via of vuln.via) {
    if (typeof via !== 'object') continue
    const id = via.url.split('/').pop()
    found.set(`${id} ${pkg}`, { id, pkg, via })
  }
}

const unexpected = [...found.values()].filter(
  ({ id, pkg }) => ACCEPTED.get(id) !== pkg,
)
const seen = new Set([...found.values()].map(({ id }) => id))
const stale = [...ACCEPTED.keys()].filter((id) => !seen.has(id))

const { total } = report.metadata.vulnerabilities
console.log(
  `npm audit: ${total} affected packages, ${found.size} advisories, ` +
    `${found.size - unexpected.length} accepted.`,
)

for (const id of stale) {
  console.warn(`Accepted advisory ${id} is no longer reported. Drop it.`)
}

if (unexpected.length) {
  console.error('\nAdvisories that are not accepted:')
  for (const { id, pkg, via } of unexpected) {
    console.error(`  ${via.severity.padEnd(8)} ${pkg} ${id} ${via.title}`)
  }
  process.exit(1)
}
