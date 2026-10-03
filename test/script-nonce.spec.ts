import { describe, expect, it } from 'vitest'

import { stampScriptNonce } from '../server/utils/script-nonce'

const sections = (
  over: Partial<
    Record<'head' | 'bodyPrepend' | 'bodyAppend' | 'body', string[]>
  > = {},
) => ({
  head: [],
  bodyPrepend: [],
  body: [],
  bodyAppend: [],
  ...over,
})

describe('stampScriptNonce', () => {
  it('nonces the scripts Nuxt emits', () => {
    const html = sections({
      head: ['<script type="importmap">{}</script>'],
      bodyAppend: ['<script>window.__NUXT__={}</script>'],
    })
    stampScriptNonce(html, 'TEST')
    expect(html.head[0]).toContain('<script nonce="TEST"')
    expect(html.bodyAppend[0]).toContain('<script nonce="TEST"')
  })

  it('does not nonce a script that arrived in the rendered app body', () => {
    const html = sections({
      body: ['<div id="__nuxt"><script>alert(1)</script></div>'],
    })
    stampScriptNonce(html, 'TEST')
    expect(html.body[0]).not.toContain('nonce')
  })

  it('leaves a tag that only starts with "script" alone', () => {
    const html = sections({ head: ['<scriptx data-a></scriptx>'] })
    stampScriptNonce(html, 'TEST')
    expect(html.head[0]).toBe('<scriptx data-a></scriptx>')
  })

  it('does not double-stamp a tag that already has a nonce', () => {
    const html = sections({ head: ['<script nonce="OLD"></script>'] })
    stampScriptNonce(html, 'TEST')
    expect(html.head[0]).toBe('<script nonce="OLD"></script>')
  })
})
