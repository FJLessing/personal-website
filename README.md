# personal-website

[fjlessing.co.za](https://www.fjlessing.co.za) is a Nuxt 4 / Vue 3 site rendered on
the server, running as a long-lived Node process behind an Apache reverse proxy.

This replaces the earlier React + Vite build
(`FJLessing/react-personal-website`, now reference-only). None of that repo's
MUI, Radix/shadcn, chart, carousel or drag-and-drop packages came across.

---

## Requirements

- Node 20.19+ (CI and the `.nvmrc` here use Node 22)
- npm 10+ (the npm 10 that Node 22 bundles installs this lockfile fine)

## Running it locally

```bash
npm ci          # installs from the lockfile; `nuxt prepare` runs on postinstall
npm run dev     # http://localhost:3101
```

The dev server binds `0.0.0.0:3101`, not Nuxt's default 3000. Port 3000 is
already in use on the Docker host, so anything bound there is unreachable from
outside the container, and 3100 is Paperclip. Override with `NUXT_DEV_PORT`,
staying inside 3101-3105.

Other scripts:

| Script              | What it does                                               |
| ------------------- | ---------------------------------------------------------- |
| `npm run build`     | Production build, a Node SSR server in `.output/`          |
| `npm run preview`   | Serves the last build (`.output/server/index.mjs`)         |
| `npm run lint`      | ESLint                                                     |
| `npm run format`    | Prettier, writing in place (`format:check` to verify only) |
| `npm run typecheck` | `vue-tsc` in strict mode, via `nuxt typecheck`             |
| `npm run test`      | Vitest                                                     |

To check the server-rendered HTML the way a crawler sees it:

```bash
npm run build
PORT=3000 node .output/server/index.mjs &
curl -s http://127.0.0.1:3000/ | less
```

Every section's text is in that HTML. If it is not, something regressed.

### Looking at it in a real browser

`curl` proves the HTML is there. It does not prove the page is readable, that
the layout holds at 360px, or that hydration ran without complaint. For that
there is a headless Chromium, installed on demand:

```bash
npm run browser:install          # once per container, ~700 MB, a few minutes
npm run screenshot -- http://127.0.0.1:3000/ --label home
```

`screenshot` loads the URL at 360px, 768px and 1440px, writes a full-page PNG
per width into `.tmp/shots`, and **exits non-zero** if the page logged a console
error, threw, failed a request, scrolled sideways, or rendered text at zero
width because no font was found. That makes it usable as a check, not just a
picture-taker:

```bash
npm run screenshot -- http://127.0.0.1:3000/not-a-real-page --label error404
```

Options: `--widths 360,1440`, `--out some/dir`, `--label name`, `--wait <css
selector>` to hold until something appears.

The installer exists because this project is developed in a Debian container
with no browser, no X server and no root. It unpacks Chromium's shared
libraries into a private sysroot with `dpkg-deb -x` and fetches Playwright's
Chromium build beside the checkout, at `../.tools/headless-browser`. Nothing is
installed system-wide and **nothing is added to `package.json`**. `npm ci`
still installs the same dependency tree it did before. Set
`HEADLESS_BROWSER_HOME` to put it somewhere else; re-running the installer
skips whatever is already in place, and `--force` redoes it.

For ad-hoc Playwright work rather than screenshots, source the generated
environment and script against the driver directly:

```bash
. ../.tools/headless-browser/env.sh
chromium --version
```

---

## How it is put together

```
app/
  app.vue                       root shell, backdrop, skip link
  layouts/default.vue           navigation + <main> + footer
  pages/index.vue               the single page; owns the SEO meta and JSON-LD
  content/site.ts               every string on the site, typed
  assets/css/main.css           Tailwind v4 entry, theme tokens, base typography
  components/
    SiteNavigation.vue          fixed header, mobile disclosure
    HeroSection.vue             portrait, headline, CTA, social links
    AboutSection.vue
    ExperienceSection.vue
    SkillsSection.vue
    InterestsSection.vue
    ContactSection.vue          contact details, no form (see below)
    SiteFooter.vue
    SectionHeading.vue          heading with one accented run of words
    AppIcon.vue                 the eight inlined SVG icons
    SiteBackground.client.vue   the animated background, mounted client-side
  composables/
    useBackgroundCanvas.ts      canvas runtime: rAF, reduced motion, pausing
  utils/backgrounds/
    scene.ts                    the contract the runtime drives
    contourScene.ts             the isoline height field itself
    palette.ts                  the colour budget, both ends of it
scripts/
  background-cost.ts            per-frame cost at 360px and 1440px
  background-contrast.ts        the colour budget as a printed table
test/
  sections.spec.ts              a smoke test per section
  hydration.spec.ts             server render vs. client hydrate, per section
  accessibility.spec.ts         measured text contrast, label-in-name
  error-page.spec.ts            the error page's copy and chrome
  backgrounds.spec.ts           scene cost caps and the colour budget
  background-runtime.spec.ts    reduced motion, pausing, small-screen caps
  support/tailwind-palette.ts   Tailwind's OKLCH tokens resolved to sRGB
```

### Content lives in one file

`app/content/site.ts` holds every user-visible string, each block annotated with
an exported interface. Changing a sentence means editing that file and nothing
else; adding a field to an interface fails the type check until the content is
filled in.

### The background

`app/components/SiteBackground.client.vue` draws **Contour**: a slow
topographic height field of four soft peaks drifting on Lissajous paths,
sampled onto a grid and traced as isolines with marching squares. The cursor
presses a dent into the terrain, so the lines bunch up around it.

The `.client` suffix means Nuxt never renders it on the server, so it may use
`window`, `document`, `requestAnimationFrame` and a canvas freely without
breaking SSR or causing a hydration mismatch. The solid `#0d0d0d` backdrop
behind it is painted in `app.vue` with CSS, so the page looks right with
JavaScript disabled or still loading. It is `aria-hidden`, it is
`pointer-events-none`, and it is decoration: the page reads fine without it.

That wrapper in `app.vue` carries `isolate`, and it has to. Without a stacking
context on it, its own background paints _after_ its negative-z-index
children, so the background layer ends up underneath the page colour. It still
renders, just multiplied down to a tenth of its brightness, which looks
like a background that does not work rather than one that is mis-stacked.

The split is deliberate. `app/utils/backgrounds/contourScene.ts` is a plain
module that only ever touches a 2D context, with no DOM and no timers, which is what
lets it be driven from Node to measure cost. Everything browser-shaped lives in
`app/composables/useBackgroundCanvas.ts`, and that is where the rules are
enforced in one place: `prefers-reduced-motion: reduce` draws a single still
frame and never starts the loop, the loop stops when the tab is hidden or the
canvas scrolls off-screen, the backing store is capped (harder on small
screens), and the scene is told it is small so it can coarsen its own grid.

`npm run bg:cost` prints the per-frame cost at 360px and 1440px;
`test/backgrounds.spec.ts` asserts the phone stays under 75% of the desktop
work, so the cap cannot silently regress.

Colours come from `app/utils/backgrounds/palette.ts`, the one place the alphas
live. The background is a translucent layer over a known opaque backdrop, so
"bright enough to see" and "dim enough to read text over" are both arithmetic:
`npm run bg:contrast` prints the table and the test asserts both ends of it.

### Icons

The eight icons are inlined in `AppIcon.vue` as real SVG elements rather than
pulled from an icon package. The geometry is Lucide's (ISC licence), which is
what the previous site used via `lucide-react`.

---

## The contact form

**There is no contact form.** The contact section is the email, phone and
website links, which work without a server.

The previous site posted a Slack Block Kit payload to `/slack-proxy.php`. A Nitro
Node server has no PHP runtime, so that endpoint does not exist here, and
composing the Slack payload in the browser is not worth reproducing. It puts the
message format in public and turns the proxy into an open relay.

A form was carried over anyway, posting JSON to `/api/contact`. Nothing was ever
built behind that path, so every submission 404ed and showed the error message.
A form that cannot work is worse than no form, so it came out.

Bringing it back needs, in this order:

1. a delivery channel and its secret — a Slack webhook URL in private
   `runtimeConfig` (`NUXT_SLACK_WEBHOOK_URL`), never `runtimeConfig.public`,
   which is serialised into the HTML,
2. `server/api/contact.post.ts`: validate `name`, `email` and `message`, reject
   anything else in the body, cap it at about 8 KB, rate limit per source, and
   return a generic error that never echoes the upstream response,
3. the markup, which is still in history. `git log --oneline` on
   `app/components/ContactSection.vue` finds the commit that removed it, and
   `git show <commit>~1:<that path>` prints the old form.

Rate limiting has to read the **last** entry of `X-Forwarded-For`, not the
first: Apache's `mod_proxy_http` appends to whatever the client sent, so the
leading entries are attacker-controlled.

---

## Deploying

**The step-by-step server guide is [`DEPLOYMENT.md`](DEPLOYMENT.md)**. It covers Apache
modules, the vhost, TLS, the systemd unit, security headers, verification,
updates and rollback. This section covers only what the build produces; it does
not repeat any of that.

**Nothing here deploys anything or touches DNS.** This is build configuration
only; putting the site on a live host needs sign-off.

### What the build produces

`nitro.preset` is `node-server`, so `npm run build` writes a self-contained Node
server to `.output/`:

```
.output/
  nitro.json                    build metadata (preset, versions)
  public/                       static assets, served by the Node server
  server/index.mjs              the entry point, this is what you run
```

`/` is prerendered at build time, so the first hit is served from a cached HTML
file with the whole page already in it rather than rendered per request. Routes
added later render on demand with no config change. Override the preset with
`NITRO_PRESET` when building for somewhere else.

### Running it

```bash
npm ci
npm run build
PORT=3000 HOST=127.0.0.1 node .output/server/index.mjs
```

It prints `Listening on http://127.0.0.1:3000` and serves the whole site.
`.output/` is self-contained, so `node_modules` is not needed at runtime.

| Variable | Default              | What it does                     |
| -------- | -------------------- | -------------------------------- |
| `PORT`   | `3000`               | Port to bind (`NITRO_PORT` also) |
| `HOST`   | `::`, all interfaces | Interface to bind (`NITRO_HOST`) |

Set `HOST` explicitly. Left alone the server binds every interface, which is the
wrong default for a process that should only be reachable through the proxy.

### The server shape

Bind to `127.0.0.1` on a fixed port and let **Apache** own the public side: it
terminates TLS on the vhost and reverse-proxies to that port. Nothing but the
proxy should be able to reach the Node process.

The Node process is long-lived and nothing restarts it on its own, so a service
manager, systemd on the target host, has to start it at boot and restart it on
failure. Without that the site is down after the first reboot or crash.

[`DEPLOYMENT.md`](DEPLOYMENT.md) has the whole procedure: which Apache modules
to enable, a copy-pasteable `:443` vhost with the proxy, compression, cache and
security headers, the `:80` redirect, a Let's Encrypt note, the systemd unit and
its start/stop/log commands, `curl` checks that prove SSR survives the proxy,
and the update and rollback steps.

---

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: install, audit,
lint, format check, type check, test, build. It is granted `contents: read` and
nothing more, and both actions are pinned to a commit SHA rather than a moving
tag.

### Dependency audit

`npm audit --omit=dev` reports **zero** vulnerabilities, and CI fails if that
changes. There are no runtime `dependencies` in this repo, so that covers
everything that reaches a browser or the Node server.

A full `npm audit` currently reports 12 high-severity advisories, all of them in
Nuxt's own build-time tree and all tracing to two packages with **no fixed
release available**:

- `braces` (via `micromatch`, `fast-glob`, `globby`): stack exhaustion on
  deeply nested glob patterns.
- `node-forge` (via `listhen`, `@nuxt/cli`, `nitropack`): used to mint a
  self-signed certificate for `nuxt dev --https`.

npm's suggested remedy is a downgrade to `nuxt@3.15.1`, which is not an option.
Neither package runs in production, and neither processes untrusted input during
our build. CI reports the full audit on every run without failing on it, so a
genuinely new advisory is still visible. Revisit when Nuxt picks up fixed
versions upstream.

---

## Conventions worth keeping

- **No browser globals at module scope.** `window`, `document`, `navigator` and
  `localStorage` go inside event handlers, `onMounted`, or a `.client` component.
- **Server and first client render must match.** No `Math.random()` or
  `Date.now()` in a render without a stable seed. The footer year goes through
  `useState` for exactly this reason. `test/hydration.spec.ts` enforces it, and
  carries a deliberately non-deterministic control case so the check cannot pass
  vacuously.
- **Strings go in `app/content/site.ts`**, not in templates.
- **Dependencies earn their place.** If 30 lines will do, write the 30 lines.
- **Mobile first.** The layout is checked at 360px before anything wider.
