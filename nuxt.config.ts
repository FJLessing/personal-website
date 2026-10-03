import tailwindcss from '@tailwindcss/vite'
import { SITE_META } from './app/content/site'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',

  modules: ['@nuxt/eslint'],

  css: ['~/assets/css/main.css'],

  typescript: {
    strict: true,
    typeCheck: false, // `npm run typecheck` runs vue-tsc; keep dev/build fast.
  },

  runtimeConfig: {
    public: {
      /**
       * Contact form target. The reference site posted to a PHP script that
       * relayed to Slack; Cloudflare Pages has no PHP runtime, so this is
       * configurable and the replacement endpoint is a separate ticket.
       * Override with `NUXT_PUBLIC_CONTACT_ENDPOINT`.
       */
      contactEndpoint: '/api/contact',
    },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'en', class: 'dark' },
      /**
       * Without JavaScript the mobile menu button cannot do anything, so the
       * panel is forced open and the button hidden. Keeps the nav links
       * reachable on a narrow viewport with JS off or still loading.
       */
      noscript: [
        {
          innerHTML:
            '<style>#site-nav-toggle{display:none}#site-nav-panel{display:block !important}</style>',
        },
      ],
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'robots', content: 'index, follow' },
        { name: 'theme-color', content: SITE_META.themeColor },
        { name: 'msapplication-TileColor', content: SITE_META.themeColor },
        { name: 'msapplication-config', content: '/browserconfig.xml' },
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        {
          rel: 'icon',
          type: 'image/png',
          sizes: '32x32',
          href: '/favicon-32x32.png',
        },
        {
          rel: 'icon',
          type: 'image/png',
          sizes: '16x16',
          href: '/favicon-16x16.png',
        },
        {
          rel: 'apple-touch-icon',
          sizes: '180x180',
          href: '/apple-touch-icon.png',
        },
        { rel: 'manifest', href: '/site.webmanifest' },
        // Social profile links, as on the reference site.
        { rel: 'me', href: 'https://www.linkedin.com/in/fj-lessing/' },
        { rel: 'me', href: 'https://github.com/FJLessing' },
        // Fonts as <link> rather than a CSS @import, which would block render.
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        {
          rel: 'preconnect',
          href: 'https://fonts.gstatic.com',
          crossorigin: '',
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap',
        },
      ],
    },
  },

  nitro: {
    /**
     * Cloudflare Pages is the deploy target. Override with `NITRO_PRESET` to
     * build for something else, e.g. `NITRO_PRESET=node-server npm run build`
     * for a local SSR server (that is what `npm run build:node` does).
     */
    preset: process.env.NITRO_PRESET || 'cloudflare_pages',
    prerender: {
      /**
       * `/` is prerendered at build time, so Cloudflare serves static HTML with
       * the full page in it. Routes added later render on demand without any
       * config change.
       */
      routes: ['/'],
      crawlLinks: true,
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },

  devtools: { enabled: false },
})
