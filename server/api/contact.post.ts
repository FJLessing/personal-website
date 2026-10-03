import { createRateLimiter } from '../utils/contact'
import { createContactHandler } from '../utils/contact-handler'

/**
 * The contact form, relayed to Slack. The webhook URL is private runtime
 * config, set with `NUXT_SLACK_WEBHOOK_URL`; without it this route answers
 * 503 and the form is not rendered. See README, "The contact form".
 */
export default createContactHandler({
  webhookUrl: (event) => useRuntimeConfig(event).slackWebhookUrl,
  // Five tries per visitor per ten minutes, valid or not.
  perSource: createRateLimiter({ limit: 5, windowMs: 10 * 60 * 1000 }),
  // Thirty messages an hour into Slack in total.
  overall: createRateLimiter({ limit: 30, windowMs: 60 * 60 * 1000 }),
})
