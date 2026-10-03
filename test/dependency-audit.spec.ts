import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

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

type Lockfile = {
  packages: Record<string, { dev?: boolean; version?: string }>
}

// The `nuxt` test environment hands out an http `import.meta.url`, so resolve
// the lockfile from the project root vitest was started in.
const lockfile = JSON.parse(
  readFileSync(join(process.cwd(), 'package-lock.json'), 'utf8'),
) as Lockfile

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
