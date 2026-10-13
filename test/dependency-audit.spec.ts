import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkAudit } from '../scripts/audit-gate-check.mjs'

// The full `npm audit` carries accepted advisories against `braces` and
// `node-forge` (see README, "Dependency audit"). The acceptance rests on one
// fact: both packages are build/dev-time only, so nothing they touch reaches a
// browser or the Node server. If that ever stops being true, the reasoning is
// void and the advisories become real. This guards the premise, not the
// advisory — a network audit does not belong in the unit suite.
const ACCEPTED_DEV_ONLY = [
  'braces',
  'micromatch',
  'fast-glob',
  'globby',
  'node-forge',
  'listhen',
]

// `simple-git` is overridden to 4.x to clear its advisories, but
// `@nuxt/devtools` 3.x still does `import Git from 'simple-git'`, a default
// export v4 removed. That only works because devtools is disabled, so Nuxt
// never loads it. Enabling devtools needs the override revisited first.
const DEVTOOLS_DISABLED = /^\s*devtools:\s*\{\s*enabled:\s*false\s*\}/m

type Lockfile = {
  packages: Record<string, { dev?: boolean; version?: string }>
}

// The `nuxt` test environment hands out an http `import.meta.url`, so resolve
// the lockfile from the project root vitest was started in.
const lockfile = JSON.parse(
  readFileSync(join(process.cwd(), 'package-lock.json'), 'utf8'),
) as Lockfile

const packageJson = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
) as { overrides?: Record<string, string> }

const nuxtConfig = readFileSync(join(process.cwd(), 'nuxt.config.ts'), 'utf8')

const entriesFor = (name: string) =>
  Object.entries(lockfile.packages).filter(([path]) =>
    path.endsWith(`node_modules/${name}`),
  )

describe('accepted audit advisories stay out of the shipped tree', () => {
  it('declares no runtime dependencies at all', () => {
    const root = lockfile.packages['']
    expect((root as { dependencies?: object }).dependencies).toBeUndefined()
  })

  it.each(ACCEPTED_DEV_ONLY)('resolves %s as dev-only', (name) => {
    const entries = entriesFor(name)

    // An accepted package that has dropped out of the tree entirely is fine;
    // one that is present in production is not.
    for (const [path, meta] of entries) {
      expect(meta.dev, `${path} is no longer dev-only`).toBe(true)
    }
  })
})

describe('the simple-git override stays safe', () => {
  it.runIf(packageJson.overrides?.['simple-git'])(
    'keeps devtools disabled while simple-git is overridden',
    () => {
      expect(nuxtConfig).toMatch(DEVTOOLS_DISABLED)
    },
  )

  it('resolves simple-git as dev-only', () => {
    for (const [path, meta] of entriesFor('simple-git')) {
      expect(meta.dev, `${path} is no longer dev-only`).toBe(true)
    }
  })
})

// `scripts/audit-gate.mjs` accepts the two advisories only while their package
// has no fixed release. The registry lookup is injected, so these run offline;
// the live gate runs in CI as `npm run audit:gate`.
describe('the audit gate', () => {
  const leaf = (pkg: string, id: string, range: string) => ({
    via: [
      {
        name: pkg,
        title: `${pkg} advisory`,
        url: `https://github.com/advisories/${id}`,
        severity: 'high',
        range,
      },
    ],
  })

  // The shape of `npm audit --json --include=dev` at edba1c6, trimmed to what
  // the gate reads.
  const report = (extra: Record<string, object> = {}) => ({
    metadata: { vulnerabilities: { total: 12 } },
    vulnerabilities: {
      braces: leaf('braces', 'GHSA-vfj7-8cjw-p6xm', '<=3.0.3'),
      micromatch: { via: ['braces'] },
      'node-forge': leaf('node-forge', 'GHSA-86w9-cpqp-85rv', '<=1.4.0'),
      ...extra,
    },
  })

  const registry =
    (latest: Record<string, string>) =>
    (pkg: string): string => {
      if (!(pkg in latest)) throw new Error(`no stub for ${pkg}`)
      return latest[pkg]!
    }

  const today = registry({ braces: '3.0.3', 'node-forge': '1.4.0' })

  it('passes the accepted advisories while no fix exists', () => {
    const result = checkAudit(report(), { latestVersion: today })

    expect(result.ok).toBe(true)
    expect(result.warnings).toEqual([])
  })

  it('fails once an accepted package ships a fixed release', () => {
    const result = checkAudit(report(), {
      latestVersion: registry({ braces: '3.0.4', 'node-forge': '1.4.0' }),
    })

    expect(result.ok).toBe(false)
    const message = result.errors.join('\n')
    expect(message).toContain('braces GHSA-vfj7-8cjw-p6xm')
    expect(message).toContain('Move braces to 3.0.4')
    expect(message).not.toContain('node-forge')
  })

  it('warns and passes when the registry lookup fails', () => {
    const result = checkAudit(report(), {
      latestVersion: registry({ braces: '3.0.3' }),
    })

    expect(result.ok).toBe(true)
    expect(result.warnings.join('\n')).toMatch(
      /Could not look up the latest node-forge/,
    )
  })

  it('fails on an advisory that is not accepted', () => {
    const result = checkAudit(
      report({ 'left-pad': leaf('left-pad', 'GHSA-xxxx-xxxx-xxxx', '<2.0.0') }),
      { latestVersion: today },
    )

    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toContain('left-pad GHSA-xxxx-xxxx-xxxx')
  })

  it('does not accept an accepted ID reported against another package', () => {
    const result = checkAudit(
      report({ picomatch: leaf('picomatch', 'GHSA-vfj7-8cjw-p6xm', '<=9') }),
      { latestVersion: today },
    )

    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toContain('picomatch GHSA-vfj7-8cjw-p6xm')
  })

  it('warns when an accepted advisory is no longer reported', () => {
    const { vulnerabilities, metadata } = report()
    const { braces: _, micromatch: __, ...rest } = vulnerabilities
    const result = checkAudit(
      { metadata, vulnerabilities: rest },
      { latestVersion: today },
    )

    expect(result.ok).toBe(true)
    expect(result.warnings).toEqual([
      'Accepted advisory GHSA-vfj7-8cjw-p6xm is no longer reported. Drop it.',
    ])
  })
})
