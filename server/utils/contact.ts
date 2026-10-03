/**
 * The pure parts of the contact endpoint: validation, the Slack payload, who
 * sent the request, and the rate limiter. No Nitro auto-imports, so the specs
 * can load this file on its own.
 */

/** About 8 KB. Three short fields fit with room to spare. */
export const CONTACT_BODY_LIMIT = 8 * 1024

const LIMITS = { name: 100, email: 254, message: 5000 } as const

/** The visible fields, plus `website`, the honeypot. */
const ALLOWED_KEYS = new Set(['name', 'email', 'message', 'website'])

/** C0 controls and DEL, except tab, line feed and carriage return. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/

/**
 * Deliberately loose. The address is only shown to FJ in Slack; it is never
 * mailed to, so the check is there to catch typos, not to be RFC 5322.
 */
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/

export interface ContactMessage {
  readonly name: string
  readonly email: string
  readonly message: string
  /** True when the honeypot was filled: answer success, send nothing. */
  readonly isBot: boolean
}

const text = (value: unknown, max: number, singleLine: boolean) => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > max) return undefined
  if (CONTROL_CHARS.test(trimmed)) return undefined
  if (singleLine && /[\r\n\t]/.test(trimmed)) return undefined
  return trimmed
}

/**
 * Returns the message, or `undefined` for anything that is not exactly the
 * form's fields. Unknown keys are rejected, not ignored.
 */
export const parseContactMessage = (
  body: unknown,
): ContactMessage | undefined => {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return undefined
  }
  const fields = body as Record<string, unknown>
  if (Object.keys(fields).some((key) => !ALLOWED_KEYS.has(key))) {
    return undefined
  }

  const honeypot = fields.website
  if (honeypot !== undefined && typeof honeypot !== 'string') return undefined

  const name = text(fields.name, LIMITS.name, true)
  const email = text(fields.email, LIMITS.email, true)
  const message = text(fields.message, LIMITS.message, false)
  if (!name || !email || !message || !EMAIL.test(email)) return undefined

  return { name, email, message, isBot: Boolean(honeypot) }
}

/**
 * Slack reads `<...>` as a link, a mention or `<!channel>`. Escaping the three
 * characters Slack asks for makes the visitor's text plain text, so a message
 * cannot ping the channel or show a link that goes somewhere else.
 */
export const escapeSlackText = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const slackPayload = ({ name, email, message }: ContactMessage) => ({
  text: [
    'New message from the website contact form',
    `Name: ${escapeSlackText(name)}`,
    `Email: ${escapeSlackText(email)}`,
    '',
    escapeSlackText(message),
  ].join('\n'),
  // Belt and braces: no bold, italics or auto-links from the visitor's text,
  // and no preview of a page the visitor chose.
  mrkdwn: false,
  unfurl_links: false,
  unfurl_media: false,
})

const isLoopback = (address: string | undefined) =>
  !!address &&
  (address === '::1' ||
    address.startsWith('127.') ||
    address.startsWith('::ffff:127.'))

/**
 * Who to rate-limit. In production the Node server listens on loopback and
 * every request comes from Apache, so the peer address is always 127.0.0.1 and
 * the visitor is in `X-Forwarded-For`.
 *
 * Take the **last** entry. `mod_proxy_http` appends the address it saw to
 * whatever the visitor sent, so every earlier entry is attacker-controlled.
 * The header is only trusted when the peer is loopback, which means Apache;
 * a direct connection uses its own address.
 */
export const clientSource = (
  remoteAddress: string | undefined,
  forwardedFor: string | undefined,
) => {
  if (forwardedFor && isLoopback(remoteAddress)) {
    const last = forwardedFor
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .at(-1)
    if (last) return last
  }
  return remoteAddress || 'unknown'
}

/**
 * The rate-limit key for an address. IPv4 stays as it is. IPv6 is cut to its
 * /64: one home or one server gets a whole /64, so keying on the full address
 * would give a visitor billions of fresh allowances.
 */
export const rateKey = (address: string) => {
  const plain = address.split('%')[0]!.replace(/^::ffff:(?=\d+\.)/i, '')
  if (!plain.includes(':')) return plain

  const [head = '', tail] = plain.split('::')
  const groups = (part: string) => (part ? part.split(':') : [])
  // A trailing dotted quad (`64:ff9b::192.0.2.1`) fills two groups.
  const width = (parts: string[]) =>
    parts.length + (parts.at(-1)?.includes('.') ? 1 : 0)
  const front = groups(head)
  const back = tail === undefined ? [] : groups(tail)
  const zeros = tail === undefined ? 0 : 8 - width(front) - width(back)
  const prefix = [
    ...front,
    ...Array<string>(Math.max(0, zeros)).fill('0'),
    ...back,
  ]
    .slice(0, 4)
    .map((group) => parseInt(group || '0', 16).toString(16))
  return `${prefix.join(':')}::/64`
}

/**
 * True when there is no `Origin`, or it names the host the request came to.
 * Apache runs with `ProxyPreserveHost On`, so `Host` is the public hostname.
 * Compared on host only: the hop from Apache to Node is plain HTTP, so the
 * scheme would never match.
 */
export const isSameOrigin = (
  origin: string | undefined,
  host: string | undefined,
) => {
  if (origin === undefined) return true
  if (!host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export interface RateLimiter {
  /** Counts one hit for `key`. False when `key` is over its limit. */
  hit(key: string): boolean
}

/**
 * Fixed window, in memory. The site is one Node process, so there is nothing
 * to share state with. The table holds at most `maxKeys` keys. When it is
 * full, the oldest key is dropped to make room: forgetting one visitor is
 * better than refusing every new one.
 */
export const createRateLimiter = ({
  limit,
  windowMs,
  maxKeys = 10_000,
  now = Date.now,
}: {
  limit: number
  windowMs: number
  maxKeys?: number
  now?: () => number
}): RateLimiter => {
  const windows = new Map<string, { count: number; resetAt: number }>()

  return {
    hit(key) {
      const time = now()
      let entry = windows.get(key)
      if (entry && entry.resetAt <= time) {
        windows.delete(key)
        entry = undefined
      }
      if (!entry) {
        // Keys are in insertion order, and with a fixed window that is also
        // expiry order. Drop from the front while the first key has expired
        // or the table is full.
        for (const [k, v] of windows) {
          if (v.resetAt > time && windows.size < maxKeys) break
          windows.delete(k)
        }
        entry = { count: 0, resetAt: time + windowMs }
        windows.set(key, entry)
      }
      entry.count += 1
      return entry.count <= limit
    },
  }
}

/**
 * Reads the request body as UTF-8, stopping as soon as it passes `limit`
 * bytes. Returns `undefined` when it is too large. `Content-Length` is checked
 * first by the caller, but a chunked body has none, so this is the real cap.
 */
export const readLimitedBody = async (
  stream: AsyncIterable<Uint8Array | string>,
  limit: number,
) => {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of stream) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    size += buffer.length
    if (size > limit) return undefined
    chunks.push(Buffer.from(buffer))
  }
  return Buffer.concat(chunks).toString('utf8')
}
