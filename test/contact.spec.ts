// @vitest-environment node
import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { createApp, toNodeListener } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  CONTACT_BODY_LIMIT,
  clientSource,
  createRateLimiter,
  escapeSlackText,
  isSameOrigin,
  parseContactMessage,
  slackPayload,
} from '../server/utils/contact'
import {
  createContactHandler,
  type ContactHandlerOptions,
} from '../server/utils/contact-handler'

/** Never a real webhook. Nothing here leaves the process. */
const WEBHOOK = 'https://hooks.slack.test/services/T000/B000/XXXX'
const GENERIC = { ok: false, error: 'Message not sent' }
const valid = { name: 'Ada', email: 'ada@example.com', message: 'Hello' }

describe('parseContactMessage', () => {
  it('accepts the three fields and trims them', () => {
    expect(
      parseContactMessage({
        name: ' Ada ',
        email: 'ada@example.com',
        message: 'Hi\nthere',
      }),
    ).toEqual({
      name: 'Ada',
      email: 'ada@example.com',
      message: 'Hi\nthere',
      isBot: false,
    })
  })

  it.each([
    ['not an object', 'hello'],
    ['an array', [valid]],
    ['null', null],
    ['a missing field', { name: 'Ada', email: 'ada@example.com' }],
    ['an empty field', { ...valid, message: '   ' }],
    ['a non-string field', { ...valid, name: 42 }],
    ['a field that is not on the form', { ...valid, source: 'x' }],
    ['a bad email', { ...valid, email: 'ada at example' }],
    ['a name over 100 characters', { ...valid, name: 'a'.repeat(101) }],
    ['a message over 5000 characters', { ...valid, message: 'a'.repeat(5001) }],
    ['a line break in the name', { ...valid, name: 'Ada\nBcc: x' }],
    ['a control character', { ...valid, message: 'a\u0007b' }],
    ['a non-string honeypot', { ...valid, website: 1 }],
  ])('rejects %s', (_, body) => {
    expect(parseContactMessage(body)).toBeUndefined()
  })

  it('flags a filled honeypot', () => {
    expect(
      parseContactMessage({ ...valid, website: 'spam.example' })?.isBot,
    ).toBe(true)
    expect(parseContactMessage({ ...valid, website: '' })?.isBot).toBe(false)
  })
})

describe('Slack payload', () => {
  it('escapes the characters Slack reads as markup', () => {
    expect(escapeSlackText('<!channel> & <https://evil.test|bank>')).toBe(
      '&lt;!channel&gt; &amp; &lt;https://evil.test|bank&gt;',
    )
  })

  it('sends the visitor text as plain text', () => {
    const payload = slackPayload({
      name: '<!here>',
      email: 'a@b.co',
      message: '<@U123> hi',
      isBot: false,
    })
    expect(payload.mrkdwn).toBe(false)
    expect(payload.text).not.toMatch(/<[!@]/)
    expect(payload.text).toContain('&lt;!here&gt;')
  })
})

describe('clientSource', () => {
  it('takes the last X-Forwarded-For entry when Apache is the peer', () => {
    expect(clientSource('127.0.0.1', '6.6.6.6, 203.0.113.9')).toBe(
      '203.0.113.9',
    )
    expect(clientSource('::ffff:127.0.0.1', '6.6.6.6,203.0.113.9 ')).toBe(
      '203.0.113.9',
    )
  })

  it('ignores X-Forwarded-For from anyone but loopback', () => {
    expect(clientSource('198.51.100.7', '203.0.113.9')).toBe('198.51.100.7')
  })
})

describe('isSameOrigin', () => {
  it('allows no Origin, or one for this host', () => {
    expect(isSameOrigin(undefined, 'www.fjlessing.co.za')).toBe(true)
    expect(
      isSameOrigin('https://www.fjlessing.co.za', 'www.fjlessing.co.za'),
    ).toBe(true)
  })

  it('refuses another host or a malformed Origin', () => {
    expect(isSameOrigin('https://evil.test', 'www.fjlessing.co.za')).toBe(false)
    expect(isSameOrigin('null', 'www.fjlessing.co.za')).toBe(false)
  })
})

describe('createRateLimiter', () => {
  it('allows the limit, refuses the next, and resets after the window', () => {
    let time = 0
    const limiter = createRateLimiter({
      limit: 2,
      windowMs: 1000,
      now: () => time,
    })
    expect([limiter.hit('a'), limiter.hit('a'), limiter.hit('a')]).toEqual([
      true,
      true,
      false,
    ])
    expect(limiter.hit('b')).toBe(true)
    time = 1000
    expect(limiter.hit('a')).toBe(true)
  })

  it('refuses new keys when the table is full of live ones', () => {
    const limiter = createRateLimiter({
      limit: 5,
      windowMs: 1000,
      maxKeys: 2,
      now: () => 0,
    })
    expect([limiter.hit('a'), limiter.hit('b'), limiter.hit('c')]).toEqual([
      true,
      true,
      false,
    ])
  })
})

/**
 * The handler over real HTTP, so body streaming, Content-Length and the
 * socket address behave as they do in production. Slack is a mock.
 */
describe('POST /api/contact', () => {
  let server: Server | undefined

  afterEach(async () => {
    await new Promise((resolve) => server?.close(resolve))
    server = undefined
    vi.restoreAllMocks()
  })

  const start = async (options: Partial<ContactHandlerOptions> = {}) => {
    const slack = vi.fn<typeof fetch>(async () => new Response('ok'))
    const app = createApp()
    app.use(
      '/api/contact',
      createContactHandler({
        webhookUrl: () => WEBHOOK,
        perSource: createRateLimiter({ limit: 100, windowMs: 60_000 }),
        overall: createRateLimiter({ limit: 100, windowMs: 60_000 }),
        fetch: slack,
        ...options,
      }),
    )
    server = createServer(toNodeListener(app))
    await new Promise<void>((resolve) =>
      server!.listen(0, '127.0.0.1', resolve),
    )
    const { port } = server.address() as AddressInfo
    return { slack, port }
  }

  /** `node:http` rather than `fetch`, which will not send Origin or Host as given. */
  const post = (
    port: number,
    body: string,
    headers: Record<string, string> = {},
  ) =>
    new Promise<{ status: number; json: unknown }>((resolve, reject) => {
      const req = request(
        {
          port,
          host: '127.0.0.1',
          path: '/api/contact',
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
        },
        (res) => {
          let data = ''
          res.on('data', (chunk) => (data += chunk))
          res.on('end', () =>
            resolve({ status: res.statusCode!, json: JSON.parse(data) }),
          )
        },
      )
      req.on('error', reject)
      req.end(body)
    })

  it('relays a valid message to Slack', async () => {
    const { slack, port } = await start()
    const res = await post(port, JSON.stringify(valid))

    expect(res).toEqual({ status: 200, json: { ok: true } })
    expect(slack).toHaveBeenCalledOnce()
    const [url, init] = slack.mock.calls[0]!
    expect(url).toBe(WEBHOOK)
    expect(JSON.parse(String(init!.body))).toEqual(
      slackPayload({ ...valid, isBot: false }),
    )
  })

  it('fails closed when no webhook is configured', async () => {
    const { slack, port } = await start({ webhookUrl: () => '' })
    expect(await post(port, JSON.stringify(valid))).toEqual({
      status: 503,
      json: GENERIC,
    })
    expect(slack).not.toHaveBeenCalled()
  })

  it.each([
    ['invalid JSON', '{', 400],
    [
      'a field that is not on the form',
      JSON.stringify({ ...valid, extra: 1 }),
      400,
    ],
    ['a missing field', JSON.stringify({ name: 'Ada' }), 400],
  ])('rejects %s', async (_, body, status) => {
    const { slack, port } = await start()
    expect(await post(port, body)).toEqual({ status, json: GENERIC })
    expect(slack).not.toHaveBeenCalled()
  })

  it('rejects a body that is not JSON', async () => {
    const { port } = await start()
    const res = await post(port, 'name=Ada', {
      'content-type': 'application/x-www-form-urlencoded',
    })
    expect(res).toEqual({ status: 415, json: GENERIC })
  })

  it('rejects an oversize body, declared or chunked', async () => {
    const { slack, port } = await start()
    const big = JSON.stringify({
      ...valid,
      message: 'a'.repeat(CONTACT_BODY_LIMIT),
    })
    expect(await post(port, big)).toEqual({ status: 413, json: GENERIC })
    expect(await post(port, big, { 'transfer-encoding': 'chunked' })).toEqual({
      status: 413,
      json: GENERIC,
    })
    expect(slack).not.toHaveBeenCalled()
  })

  it('refuses a cross-origin POST', async () => {
    const { slack, port } = await start()
    const res = await post(port, JSON.stringify(valid), {
      origin: 'https://evil.test',
      host: 'www.fjlessing.co.za',
    })
    expect(res).toEqual({ status: 403, json: GENERIC })
    expect(slack).not.toHaveBeenCalled()
  })

  it('answers a filled honeypot with success and sends nothing', async () => {
    const { slack, port } = await start()
    const res = await post(port, JSON.stringify({ ...valid, website: 'x' }))
    expect(res).toEqual({ status: 200, json: { ok: true } })
    expect(slack).not.toHaveBeenCalled()
  })

  it('rate limits on the last X-Forwarded-For entry, not the first', async () => {
    const { port } = await start({
      perSource: createRateLimiter({ limit: 1, windowMs: 60_000 }),
    })
    const as = (xff: string) =>
      post(port, JSON.stringify(valid), { 'x-forwarded-for': xff })

    expect((await as('1.1.1.1, 203.0.113.9')).status).toBe(200)
    // A new spoofed first entry does not buy a fresh allowance.
    expect(await as('2.2.2.2, 203.0.113.9')).toEqual({
      status: 429,
      json: GENERIC,
    })
    expect((await as('1.1.1.1, 203.0.113.10')).status).toBe(200)
  })

  it('caps total messages into Slack', async () => {
    const { slack, port } = await start({
      overall: createRateLimiter({ limit: 1, windowMs: 60_000 }),
    })
    expect((await post(port, JSON.stringify(valid))).status).toBe(200)
    expect(await post(port, JSON.stringify(valid))).toEqual({
      status: 429,
      json: GENERIC,
    })
    expect(slack).toHaveBeenCalledOnce()
  })

  it('never echoes what Slack said', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { port } = await start({
      fetch: async () =>
        new Response(`invalid_token ${WEBHOOK}`, { status: 403 }),
    })
    expect(await post(port, JSON.stringify(valid))).toEqual({
      status: 502,
      json: GENERIC,
    })
    expect(String(vi.mocked(console.error).mock.calls)).not.toContain(WEBHOOK)
  })

  it('gives up on a Slack call that hangs', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { port } = await start({
      timeoutMs: 50,
      fetch: (_, init) =>
        new Promise((_, reject) =>
          init!.signal!.addEventListener('abort', () =>
            reject(init!.signal!.reason),
          ),
        ),
    })
    expect(await post(port, JSON.stringify(valid))).toEqual({
      status: 502,
      json: GENERIC,
    })
  })
})
