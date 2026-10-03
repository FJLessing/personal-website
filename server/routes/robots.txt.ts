import { SITE_META } from '../../app/content/site'
import { buildRobotsTxt } from '../utils/crawl'

export default defineEventHandler((event) => {
  setResponseHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setResponseHeader(event, 'cache-control', 'public, max-age=3600')
  return buildRobotsTxt(SITE_META.url)
})
