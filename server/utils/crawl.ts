/**
 * Pure builders for `/robots.txt` and `/sitemap.xml`, kept out of the route
 * files so a spec can call them without a server. The origin always comes
 * from `SITE_META.url`; nothing here knows a hostname.
 */

/** Resolve a site path against the canonical origin. */
export const absoluteUrl = (origin: string, path: string): string =>
  new URL(path, origin).href

/**
 * Every public page worth indexing. The site is one page, so this is `/`.
 * Add a path here when a route ships, and it reaches the sitemap.
 */
export const SITEMAP_PATHS: readonly string[] = ['/']

/** `&`, `<`, `>`, `"` and `'` are the five characters XML cannot hold raw. */
export const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

export const buildSitemapXml = (
  origin: string,
  paths: readonly string[] = SITEMAP_PATHS,
): string => {
  // No <lastmod>: Google ignores it unless it is reliably accurate, and the
  // build has no honest per-page modified date to give.
  const urls = paths
    .map(
      (path) =>
        `  <url><loc>${escapeXml(absoluteUrl(origin, path))}</loc></url>`,
    )
    .join('\n')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
    '',
  ].join('\n')
}

/**
 * Everything is open to every crawler, search and AI alike, apart from the
 * contact endpoint, which only ever answers a POST. `/_nuxt/` is left open on
 * purpose: Googlebot needs the scripts and styles to render the page.
 */
export const buildRobotsTxt = (origin: string): string =>
  [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    '',
    `Sitemap: ${absoluteUrl(origin, '/sitemap.xml')}`,
    '',
  ].join('\n')
