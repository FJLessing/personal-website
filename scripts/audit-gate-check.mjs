// The decision half of `scripts/audit-gate.mjs`, kept apart from the npm calls
// so `test/dependency-audit.spec.ts` can feed it a report and a stubbed
// registry.

import semver from 'semver'

// Advisory ID -> the package it is accepted for. Each one is accepted only
// while its package has no fixed release: the gate fails once the registry's
// `latest` falls outside the vulnerable range, and warns once the advisory
// stops being reported. Remove the entry in either case.
export const ACCEPTED = new Map([
  ['GHSA-vfj7-8cjw-p6xm', 'braces'],
  ['GHSA-86w9-cpqp-85rv', 'node-forge'],
])

// `report` is the parsed `npm audit --json`. `latestVersion(pkg)` returns the
// registry's `latest` for a package, or throws if the lookup fails.
export function checkAudit(report, { accepted = ACCEPTED, latestVersion }) {
  const log = []
  const warnings = []
  const errors = []

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
    ({ id, pkg }) => accepted.get(id) !== pkg,
  )
  const seen = new Set([...found.values()].map(({ id }) => id))
  const stale = [...accepted.keys()].filter((id) => !seen.has(id))

  // npm's `fixAvailable` is no use here: it says `true` for `braces` and
  // offers a major downgrade of `@nuxt/test-utils` for `node-forge`, though
  // neither leaf has a patched release. Ask the registry instead. A failed
  // lookup warns rather than fails, so a registry blip cannot turn CI red.
  const fixed = []
  for (const { id, pkg, via } of found.values()) {
    if (accepted.get(id) !== pkg) continue
    let latest
    try {
      latest = latestVersion(pkg)
    } catch (error) {
      warnings.push(
        `Could not look up the latest ${pkg} to check ${id} for a fix: ` +
          `${error.message}. Not checked this run.`,
      )
      continue
    }
    if (!semver.valid(latest) || !semver.validRange(via.range)) {
      warnings.push(
        `Could not compare ${pkg} ${latest} with the range ${via.range} ` +
          `for ${id}. Not checked this run.`,
      )
      continue
    }
    if (!semver.satisfies(latest, via.range)) {
      fixed.push({ id, pkg, via, latest })
    }
  }

  const { total } = report.metadata.vulnerabilities
  log.push(
    `npm audit: ${total} affected packages, ${found.size} advisories, ` +
      `${found.size - unexpected.length} accepted.`,
  )

  for (const id of stale) {
    warnings.push(`Accepted advisory ${id} is no longer reported. Drop it.`)
  }

  if (unexpected.length) {
    errors.push('Advisories that are not accepted:')
    for (const { id, pkg, via } of unexpected) {
      errors.push(`  ${via.severity.padEnd(8)} ${pkg} ${id} ${via.title}`)
    }
  }

  if (fixed.length) {
    errors.push('Accepted advisories that now have a fixed release:')
    for (const { id, pkg, via, latest } of fixed) {
      errors.push(
        `  ${pkg} ${id}: ${latest} is outside the vulnerable range ` +
          `${via.range}. Move ${pkg} to ${latest} and drop the acceptance.`,
      )
    }
  }

  return { ok: errors.length === 0, log, warnings, errors }
}
