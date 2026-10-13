import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import semver from 'semver'
import { describe, expect, it } from 'vitest'

// `engines.node` must be the real floor of the locked tree, not a guess. A
// dependency bump that raises its own `engines.node` makes `npm ci` print
// EBADENGINE on any host below the new floor, and the build may or may not
// still work there. This fails as soon as the declared range admits a Node
// version that some locked package does not support.
//
// `allowScripts` records a decision for every locked package with an install
// script, so npm 11.16+ prints no "not yet covered by allowScripts" warning.
// See README, "Install scripts".

type LockEntry = {
  version?: string
  engines?: { node?: string } | string[]
  hasInstallScript?: boolean
}

// The `nuxt` test environment hands out an http `import.meta.url`, so resolve
// the files from the project root vitest was started in.
const read = (file: string) =>
  JSON.parse(readFileSync(join(process.cwd(), file), 'utf8'))

const lockfile = read('package-lock.json') as {
  packages: Record<string, LockEntry>
}
const packageJson = read('package.json') as {
  engines: { node: string }
  allowScripts?: Record<string, boolean>
}

const declared = packageJson.engines.node
const name = (path: string) => path.replace(/^.*node_modules\//, '')
const dependencies = Object.entries(lockfile.packages).filter(([path]) => path)

describe('engines.node matches the locked tree', () => {
  it('is a valid range', () => {
    expect(semver.validRange(declared)).not.toBeNull()
  })

  it('is mirrored in the lockfile root', () => {
    expect(lockfile.packages['']?.engines).toEqual(packageJson.engines)
  })

  // Older packages can carry the legacy array form of `engines`, which npm
  // ignores. Only a string range is enforced.
  const ranges = dependencies.flatMap(([path, meta]) => {
    const node = Array.isArray(meta.engines) ? undefined : meta.engines?.node
    return node ? [[`${name(path)}@${meta.version}`, node] as const] : []
  })

  it('admits only Node versions every locked package supports', () => {
    const tooWide = ranges
      .filter(([, range]) => !semver.subset(declared, range))
      .map(([pkg, range]) => `${pkg} requires node ${range}`)

    // Raise engines.node in package.json and the lockfile root to the
    // intersection of these ranges.
    expect(tooWide).toEqual([])
  })
})

describe('every install script has an allowScripts decision', () => {
  const withScripts = dependencies
    .filter(([, meta]) => meta.hasInstallScript)
    .map(([path]) => name(path))

  // Keys are a bare name or a pinned `name@range`; the name may be scoped.
  const covered = Object.keys(packageJson.allowScripts ?? {}).map((key) =>
    key.replace(/(?<=.)@.*$/, ''),
  )

  it('leaves no install script undecided', () => {
    expect(withScripts.filter((pkg) => !covered.includes(pkg))).toEqual([])
  })
})
