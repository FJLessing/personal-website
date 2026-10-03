import { randomBytes } from 'node:crypto'

/**
 * Sets the Content-Security-Policy, with a fresh nonce per request.
 *
 * Why the app and not the vhost: Nuxt emits inline `<script>` blocks on every
 * render — the import map and `window.__NUXT__.config` — and both embed the
 * build id, so a build-time hash in the Apache config would go stale on every
 * deploy. The alternative Apache can express is `'unsafe-inline'`, which is
 * the one weak directive in an otherwise tight policy: it lets any injected
 * `<script>` in the page execute.
 *
 * A nonce fixes that, and a nonce has to be generated per request by whatever
 * renders the HTML. Apache cannot know a value the app never told it.
 *
 * **The vhost must not also set `Content-Security-Policy`.** Two CSP headers
 * do not merge; the browser enforces the intersection of both, which is a
 * miserable bug to track down. `DEPLOYMENT.md` section 5 says the same thing
 * from the other side.
 *
 * `/` is deliberately not prerendered (see `nuxt.config.ts`): a nonce baked
 * into a static file at build time is the same nonce for every visitor, which
 * is worth exactly nothing.
 */

/** Every inline and external `<script>` the render emits. */
const SCRIPT_TAG = /<script(?![^>]*\bnonce=)/g

/**
 * `style-src` keeps `'unsafe-inline'`. The `noscript` block in
 * `nuxt.config.ts` and Vue's `style="display:none"` attribute both need it,
 * and a nonce cannot cover a style *attribute* at all. Style-based
 * exfiltration is a far weaker primitive than script execution, so landing
 * `script-src` on its own is most of the win.
 */
const policy = (nonce: string) =>
  [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    'upgrade-insecure-requests',
  ].join('; ')

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('render:html', (html, { event }) => {
    // 128 bits, from the CSPRNG. The spec asks for at least 128 bits of
    // entropy and a value that is unguessable before the response is sent.
    const nonce = randomBytes(16).toString('base64')

    for (const section of [
      html.head,
      html.bodyPrepend,
      html.body,
      html.bodyAppend,
    ]) {
      for (const [index, chunk] of section.entries()) {
        section[index] = chunk.replace(SCRIPT_TAG, `<script nonce="${nonce}"`)
      }
    }

    setResponseHeader(event, 'content-security-policy', policy(nonce))
  })
})
