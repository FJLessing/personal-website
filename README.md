# personal-website

[fjlessing.co.za](https://www.fjlessing.co.za) — a Nuxt 4 / Vue 3 site rendered on
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
npm run dev     # http://localhost:3000
```

Other scripts:

| Script              | What it does                                               |
| ------------------- | ---------------------------------------------------------- |
| `npm run build`     | Production build — a Node SSR server in `.output/`         |
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
    ContactSection.vue          contact details + the contact form
    SiteFooter.vue
    SectionHeading.vue          heading with one accented run of words
    AppIcon.vue                 the eight inlined SVG icons
    SiteBackground.client.vue   mount point for the animated background
test/
  sections.spec.ts              a smoke test per section
  hydration.spec.ts             server render vs. client hydrate, per section
```

### Content lives in one file

`app/content/site.ts` holds every user-visible string, each block annotated with
an exported interface. Changing a sentence means editing that file and nothing
else; adding a field to an interface fails the type check until the content is
filled in.

### The background slot

`app/components/SiteBackground.client.vue` is deliberately empty. The `.client`
suffix means Nuxt never renders it on the server, so whatever mounts there may
use `window`, `document`, `requestAnimationFrame` and a canvas freely without
breaking SSR or causing a hydration mismatch. The solid `#232323` backdrop
behind it is painted in `app.vue` with CSS, so the page looks right with
JavaScript disabled or still loading.

Whatever lands there must cap work on small screens, pause when the tab is
hidden, honour `prefers-reduced-motion: reduce`, stay behind the content
(`-z-10`) and never swallow pointer events.

### Icons

The eight icons are inlined in `AppIcon.vue` as real SVG elements rather than
pulled from an icon package. The geometry is Lucide's (ISC licence), which is
what the previous site used via `lucide-react`.

---

## The contact form

**The form has no working endpoint yet.** This needs a follow-up before the site
goes live.

The previous site posted a Slack Block Kit payload to `/slack-proxy.php`. A Nitro
Node server has no PHP runtime, so that endpoint does not exist here, and
composing the Slack payload in the browser is not worth reproducing — it puts the
message format in public and turns the proxy into an open relay.

The form now POSTs JSON to whatever `NUXT_PUBLIC_CONTACT_ENDPOINT` points at,
defaulting to `/api/contact`:

```json
{
  "name": "...",
  "email": "...",
  "message": "...",
  "source": "https://www.fjlessing.co.za/"
}
```

Any 2xx is treated as success; anything else shows the error message. A
replacement endpoint — a Nitro server route under `server/api/`, holding the
webhook URL as a secret and rate-limiting submissions — is a separate ticket.
Until it exists, the email and phone links in the same section still work.

---

## Deploying

**The step-by-step server guide is [`DEPLOYMENT.md`](DEPLOYMENT.md)** — Apache
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
  server/index.mjs              the entry point — this is what you run
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

It prints `Listening on http://127.0.0.1:3000` and serves the whole site —
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
manager — systemd on the target host — has to start it at boot and restart it on
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

- `braces` (via `micromatch` → `fast-glob` → `globby`) — stack exhaustion on
  deeply nested glob patterns.
- `node-forge` (via `listhen` → `@nuxt/cli`, `nitropack`) — used to mint a
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
  `Date.now()` in a render without a stable seed — the footer year goes through
  `useState` for exactly this reason. `test/hydration.spec.ts` enforces it, and
  carries a deliberately non-deterministic control case so the check cannot pass
  vacuously.
- **Strings go in `app/content/site.ts`**, not in templates.
- **Dependencies earn their place.** If 30 lines will do, write the 30 lines.
- **Mobile first.** The layout is checked at 360px before anything wider.
