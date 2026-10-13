// Fail on any `npm audit` advisory that is not on the accepted list, and on
// any accepted one whose package has since shipped a fix.
//
//   npm run audit:gate
//
// The full audit cannot reach zero while `braces` and `node-forge` have no
// fixed release (see README, "Dependency audit"), so a plain
// `npm audit --audit-level=low` would be red for good and nobody would read
// it. This keeps the gate honest instead: the two accepted advisories pass
// while the registry has nothing newer than the vulnerable range, and anything
// new fails the build. The rules live in `audit-gate-check.mjs`.
//
// `--include=dev` is explicit because `NODE_ENV=production` makes npm omit dev
// dependencies by default, which turns a "full" audit into `--omit=dev`
// without saying so.

import { spawnSync } from 'node:child_process'
import { checkAudit } from './audit-gate-check.mjs'

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

// `npm view` goes through the same registry and proxy config as `npm audit`.
function latestVersion(pkg) {
  const view = spawnSync('npm', ['view', pkg, 'version'], {
    encoding: 'utf8',
    timeout: 30_000,
  })
  if (view.error) throw view.error
  if (view.status !== 0) {
    throw new Error(view.stderr.trim() || `npm view exited ${view.status}`)
  }
  return view.stdout.trim()
}

const { ok, log, warnings, errors } = checkAudit(report, { latestVersion })

for (const line of log) console.log(line)
for (const line of warnings) console.warn(line)
if (!ok) {
  console.error('\n' + errors.join('\n'))
  process.exit(1)
}
