import { describe, expect, it } from 'vitest'

import { SITE_META } from '../app/content/site'
import {
  absoluteUrl,
  buildRobotsTxt,
  buildSitemapXml,
} from '../server/utils/crawl'

describe('buildSitemapXml', () => {
  it('lists the home page on the canonical host', () => {
    const xml = buildSitemapXml(SITE_META.url)
    expect(xml).toContain(`<loc>${new URL('/', SITE_META.url).href}</loc>`)
  })

  it('is well formed and uses the sitemap namespace', () => {
    const xml = buildSitemapXml('https://example.test')
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    )
    expect(xml).toContain('</urlset>')
  })

  it('escapes characters XML cannot hold', () => {
    const xml = buildSitemapXml('https://example.test', ['/a?x=1&y=2'])
    expect(xml).toContain('<loc>https://example.test/a?x=1&amp;y=2</loc>')
  })

  it('does not invent a lastmod', () => {
    expect(buildSitemapXml(SITE_META.url)).not.toContain('lastmod')
  })
})

describe('buildRobotsTxt', () => {
  it('opens the site and points at the sitemap on the canonical host', () => {
    const txt = buildRobotsTxt(SITE_META.url)
    expect(txt).toContain('User-agent: *\nAllow: /')
    expect(txt).toContain(
      `Sitemap: ${new URL('/sitemap.xml', SITE_META.url).href}`,
    )
  })

  it('keeps crawlers out of the API only', () => {
    const lines = buildRobotsTxt(SITE_META.url)
      .split('\n')
      .filter((line) => line.startsWith('Disallow'))
    expect(lines).toEqual(['Disallow: /api/'])
  })
})

describe('absoluteUrl', () => {
  it('resolves against the origin', () => {
    expect(absoluteUrl('https://example.test', '/x')).toBe(
      'https://example.test/x',
    )
  })
})
