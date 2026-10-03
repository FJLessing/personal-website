import {
  defineEventHandler,
  getRequestHeader,
  setResponseStatus,
  type H3Event,
} from 'h3'

import {
  CONTACT_BODY_LIMIT,
  clientSource,
  isSameOrigin,
  parseContactMessage,
  readLimitedBody,
  slackPayload,
  type RateLimiter,
} from './contact'

export interface ContactHandlerOptions {
  /** The Slack incoming-webhook URL, or empty when it is not configured. */
  webhookUrl: (event: H3Event) => string | undefined
  /** Per visitor, counted on every request. */
  perSource: RateLimiter
  /**
   * Across all visitors, counted only on a message that is about to go to
   * Slack. Caps what a visitor with many addresses can push into the channel,
   * without letting junk requests use up the budget.
   */
  overall: RateLimiter
  fetch?: typeof fetch
  timeoutMs?: number
}

/**
 * Every failure gets the same body. The status code says what kind of failure
 * it was; nothing from Slack, the webhook URL or a stack trace ever reaches
 * the visitor.
 */
const fail = (event: H3Event, status: number) => {
  setResponseStatus(event, status)
  return { ok: false, error: 'Message not sent' } as const
}

/**
 * `POST /api/contact`. Built as a factory, with explicit imports, so the specs
 * can drive it with a fake Slack and their own limiters.
 */
export const createContactHandler = ({
  webhookUrl,
  perSource,
  overall,
  fetch: send = fetch,
  timeoutMs = 5000,
}: ContactHandlerOptions) =>
  defineEventHandler(async (event) => {
    const url = webhookUrl(event)
    if (!url) return fail(event, 503)

    if (
      !isSameOrigin(
        getRequestHeader(event, 'origin'),
        getRequestHeader(event, 'host'),
      )
    ) {
      return fail(event, 403)
    }

    const source = clientSource(
      event.node.req.socket.remoteAddress,
      getRequestHeader(event, 'x-forwarded-for'),
    )
    if (!perSource.hit(source)) return fail(event, 429)

    const contentType = getRequestHeader(event, 'content-type') ?? ''
    if (!/^application\/json\s*(;|$)/i.test(contentType)) {
      return fail(event, 415)
    }

    const declared = Number(getRequestHeader(event, 'content-length') ?? 0)
    if (declared > CONTACT_BODY_LIMIT) return fail(event, 413)
    const raw = await readLimitedBody(event.node.req, CONTACT_BODY_LIMIT)
    if (raw === undefined) return fail(event, 413)

    let body: unknown
    try {
      body = JSON.parse(raw)
    } catch {
      return fail(event, 400)
    }
    const message = parseContactMessage(body)
    if (!message) return fail(event, 400)

    // A bot filled the hidden field. Tell it that it worked, send nothing.
    if (message.isBot) return { ok: true } as const

    if (!overall.hit('all')) return fail(event, 429)

    try {
      const response = await send(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(slackPayload(message)),
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!response.ok) {
        // Status only. The body and the URL stay out of the log.
        console.error(`contact: Slack answered ${response.status}`)
        return fail(event, 502)
      }
    } catch (error) {
      const name = error instanceof Error ? error.name : 'unknown error'
      console.error(`contact: Slack request failed (${name})`)
      return fail(event, 502)
    }

    return { ok: true } as const
  })
