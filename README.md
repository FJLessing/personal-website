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
    ContactSection.vue          contact details, and the form when Slack is set
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
server/
  plugins/
    content-security-policy.ts  the CSP, with a per-request nonce
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

### The app sets its own CSP

`server/plugins/content-security-policy.ts` generates a 128-bit nonce per
request, stamps it on every `<script>` the render emits, and sends the matching
`Content-Security-Policy` header from the same hook. That is what lets
`script-src` be `'self' 'nonce-…'` instead of `'self' 'unsafe-inline'`.

It has to be the app rather than the Apache vhost, because Apache cannot know a
value the app never told it, and a build-time hash cannot work either: the
import map and the runtime-config block both embed the build id, so the hash
would change on every deploy.

**The vhost must not set `Content-Security-Policy` as well.** Two CSP headers do
not merge; the browser enforces the intersection of both. `DEPLOYMENT.md`
section 5 has the rest.

### The fonts are self-hosted

IBM Plex lives in `public/fonts/` — Google's own latin and latin-ext woff2
subsets, declared in `app/assets/css/main.css` and preloaded for the two faces
above the fold. Nothing is fetched from `fonts.googleapis.com` or
`fonts.gstatic.com`.

That is a privacy decision before it is a performance one: a Google-hosted
stylesheet hands every first-time visitor's IP, user agent and referer to a
third party before the page paints. It also happened to be the single largest
render-blocking resource on the page, and it let the CSP drop two origins.

Sans is the variable font, so one file per subset covers every weight. Mono is
static: one file per weight, and only 400/500/700 because nothing uses 600.
Licence: SIL OFL 1.1, in `public/fonts/LICENSE.txt`.

### The portrait is four files

`public/profile.png` is the untouched master, 620x617 and 480 KB. It is the
Open Graph image and nothing else — the page never loads it.

The hero loads `profile-512.{avif,webp,png}` through a `<picture>`: 512px
square, which is the rendered box at 2x, at 13 KB, 17 KB and 122 KB. A browser
takes the first format it understands, so almost every visitor gets the AVIF.
Regenerate them from the master with `sharp` if the photo ever changes.

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

The form posts JSON to `/api/contact` (`server/api/contact.post.ts`), which
relays the message to Slack through an incoming webhook. The email, phone and
website links sit next to it and work without a server.

**The form only appears when the webhook is configured.** Set
`NUXT_SLACK_WEBHOOK_URL` in the server's environment. It is private
`runtimeConfig` (`slackWebhookUrl`), never `runtimeConfig.public`, which is
serialised into the HTML. Without it the endpoint answers 503 and the page
shows the links only. A form that can only fail is worse than no form.

What the endpoint does, in order (`server/utils/contact-handler.ts`):

1. 503 if no webhook is set.
2. 403 if the request has an `Origin` for another host. Compared on host
   against `Host`, which Apache keeps with `ProxyPreserveHost On`.
3. 429 after 5 requests per visitor in 10 minutes, valid or not. An IPv6
   visitor is counted by /64, not by single address.
4. 415 unless the body is `application/json`.
5. 413 over 8 KB, whether `Content-Length` says so or a chunked body runs over.
6. 400 unless the body is exactly `name`, `email`, `message` and the honeypot
   `website`, each within its length limit. Any other key is rejected.
7. A filled honeypot gets a 200 and nothing is sent.
8. 429 after 30 messages into Slack in an hour, across all visitors. The
   journal logs `contact: hourly cap reached` when this happens.
9. The message goes to Slack as plain text, with `&`, `<` and `>` escaped, so
   a visitor cannot ping `@channel` or plant a disguised link. Link and media
   previews are off. 5 second timeout, no redirects.

Every failure returns the same body, `{"ok":false,"error":"Message not sent"}`.
Nothing from Slack, the webhook URL or a stack trace reaches the visitor or the
log.

The visitor is the **last** entry of `X-Forwarded-For`, and only when the peer
is loopback (Apache). `mod_proxy_http` appends to whatever the client sent, so
the leading entries are attacker-controlled. The live site is behind
Cloudflare, so Apache needs `mod_remoteip` to put the visitor, not the
Cloudflare edge, in that last entry (`DEPLOYMENT.md`, "Behind Cloudflare"). The
rate limits live in memory,
which suits a single Node process; they reset on restart. The per-visitor table
holds 10,000 keys; when it is full the oldest is dropped, so a flood of new
addresses cannot lock everyone else out.

The `Origin` check and the `application/json` requirement are the CSRF guard
together. Do not relax the content type without adding a token.

The visitor sees a separate message on a 429, and a line under the button says
the message goes to Slack and is used only to reply (POPIA section 18).

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

Every request is server-rendered; nothing is prerendered. `/` used to be, but
the CSP nonce in `server/plugins/content-security-policy.ts` has to be new on
every response, and a nonce baked into a static file is the same one for every
visitor. Override the preset with `NITRO_PRESET` when building for somewhere
else.

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

A full `npm audit` reports 12 high-severity advisories, all of them in Nuxt's
own build-time tree and all tracing to two packages. Both are **accepted**, not
outstanding: there is no fixed release to move to, and npm's suggested remedy is
a downgrade to `nuxt@3.15.1`, which is not an option.

| Advisory                                                                 | Package                | Installed      | Fixed in | Why it is accepted                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------ | ---------------------- | -------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | `braces` (CWE-674)     | 3.0.3 (latest) | none yet | Stack exhaustion on a deeply nested glob pattern. Reached only through `micromatch` → `fast-glob` → `globby` → `nitropack` at build time, over patterns that come from our own config, never from a request.                                                |
| [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | `node-forge` (CWE-347) | 1.4.0 (latest) | none yet | Lax PKCS#1 v1.5 signature verification. Reached only through `listhen` → `@nuxt/cli`, which uses `node-forge` to _mint_ a self-signed certificate for `nuxt dev --https`. We verify no signatures with it, and it never runs outside a developer's machine. |

The acceptance rests on one premise: both packages are dev/build-only, so
nothing they touch reaches a browser or the Node server.
`test/dependency-audit.spec.ts` pins that premise — it fails if the repo gains a
runtime `dependency` or if either package stops resolving as `dev` in
`package-lock.json`. CI also reports the full audit on every run without failing
on it, so a genuinely new advisory is still visible.

Residual risk: a pull request can still make CI's own `npm run build` spend
effort on a hostile glob pattern. The job is `contents: read`, carries no write
token, and the worst case is a failed build on a throwaway runner.

Last reviewed 2026-10-04 against commit `792a163`: 12 high, 0 critical, 0
moderate, 0 low; `npm audit --omit=dev` found 0. Revisit when Nuxt picks up
fixed versions upstream.

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
