/**
 * Every `<script>` Nuxt itself emits. `(?=[\s/>])` pins the tag name so
 * `<scriptx>` is left alone rather than rewritten into a real script tag;
 * the second lookahead skips a tag that already carries a nonce.
 */
const SCRIPT_TAG = /<script(?=[\s/>])(?![^>]*\bnonce=)/g

/**
 * Stamps the request nonce onto the script tags Nuxt emits.
 *
 * `html.body` is deliberately not stamped. It holds the output of
 * `renderToString`, and the regex cannot tell a script Nuxt emitted from one
 * that arrived inside that markup, so stamping it would hand the valid nonce
 * to any injected `<script>` — the exact case the nonce exists to stop. Nuxt
 * puts none of its own scripts there: the import map, the entry module and
 * the JSON-LD block land in `head`, and `window.__NUXT__` plus the payload
 * land in `bodyAppend`.
 *
 * A component that genuinely needs an inline script must declare it through
 * `useHead`, not as raw markup in a template.
 */
export const stampScriptNonce = (
  html: { head: string[]; bodyPrepend: string[]; bodyAppend: string[] },
  nonce: string,
) => {
  for (const section of [html.head, html.bodyPrepend, html.bodyAppend]) {
    for (const [index, chunk] of section.entries()) {
      section[index] = chunk.replace(SCRIPT_TAG, `<script nonce="${nonce}"`)
    }
  }
}
