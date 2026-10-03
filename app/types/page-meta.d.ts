import type { BackgroundVariant } from '~/utils/backgrounds/scene'

/**
 * Temporary, for the background bake-off: the three concept demos under
 * `/bg/*` declare which one they want and `SiteBackground` reads it. Goes away
 * with the demo routes once the owner has picked.
 */
declare module '#app' {
  interface PageMeta {
    background?: BackgroundVariant
  }
}

declare module 'vue-router' {
  interface RouteMeta {
    background?: BackgroundVariant
  }
}

export {}
