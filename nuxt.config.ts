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
        /**
         * The two faces above the fold: Mono 400 is the body default, Sans is
         * every heading. Both are discovered inside the stylesheet, which is
         * one round trip too late, so they are preloaded here. `crossorigin`
         * is required even same-origin — a font request is CORS-mode, and
         * without it the preload is fetched twice.
         *
         * The rest of the faces are declared in `app/assets/css/main.css` and
         * fetched only if a glyph needs them.
         */
        {
          rel: 'preload',
          as: 'font',
          type: 'font/woff2',
          href: '/fonts/ibm-plex-mono-400-latin.woff2',
          crossorigin: '',
        },
        {
          rel: 'preload',
          as: 'font',
          type: 'font/woff2',
          href: '/fonts/ibm-plex-sans-latin.woff2',
          crossorigin: '',
        },
      ],
    },
  },

  nitro: {
    /**
     * A plain Node SSR server is the deploy target: `node .output/server/
     * index.mjs` behind an Apache reverse proxy. Override with `NITRO_PRESET`
     * to build for something else.
     */
    preset: process.env.NITRO_PRESET || 'node-server',
    prerender: {
      /**
       * `/` is prerendered at build time, so the first hit is served as static
       * HTML with the full page in it. Routes added later render on demand
       * without any config change.
       */
      routes: ['/'],
      crawlLinks: true,
    },
  },

  /**
   * The dev server runs inside a Docker container, so it has to listen on all
   * interfaces to be reachable from the host. Port is fixed so the published
   * container port never moves.
   *
   * 3101, not Nuxt's default 3000: 3000 is already taken on the Docker host,
   * so a dev server bound there is unreachable from outside the container.
   * 3100 is Paperclip. Use 3101-3105; override with NUXT_DEV_PORT.
   */
  devServer: {
    host: '0.0.0.0',
    port: Number(process.env.NUXT_DEV_PORT || 3101),
  },

  vite: {
    plugins: [tailwindcss()],
    server: {
      /**
       * Dev only. Vite rejects requests whose Host header it does not know,
       * which blocks review through a hostname or a reverse proxy. The dev
       * server is not exposed to the public internet.
       */
      allowedHosts: true,
    },
  },

  devtools: { enabled: false },
})
