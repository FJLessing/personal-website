import { SITE_META } from '../../app/content/site'
import { buildSitemapXml } from '../utils/crawl'

export default defineEventHandler((event) => {
  setResponseHeader(event, 'content-type', 'application/xml; charset=utf-8')
  setResponseHeader(event, 'cache-control', 'public, max-age=3600')
  return buildSitemapXml(SITE_META.url)
})
