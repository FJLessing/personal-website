# personal-website

[fjlessing.co.za](https://www.fjlessing.co.za) — a Nuxt 4 / Vue 3 site rendered on
the server and deployed to Cloudflare Pages.

This replaces the earlier React + Vite build
(`FJLessing/react-personal-website`, now reference-only). None of that repo's
MUI, Radix/shadcn, chart, carousel or drag-and-drop packages came across.

---

## Requirements

- Node 20.19+ (CI and the `.nvmrc` here use Node 22)
- npm 10+

## Running it locally

```bash
npm ci          # installs from the lockfile; `nuxt prepare` runs on postinstall
npm run dev     # http://localhost:3000
```

Other scripts:

| Script               | What it does                                               |
| -------------------- | ---------------------------------------------------------- |
| `npm run build`      | Production build for Cloudflare Pages, output in `dist/`   |
| `npm run build:node` | Same app built as a Node SSR server, output in `.output/`  |
| `npm run preview`    | Serves the last build                                      |
| `npm run lint`       | ESLint                                                     |
| `npm run format`     | Prettier, writing in place (`format:check` to verify only) |
| `npm run typecheck`  | `vue-tsc` in strict mode, via `nuxt typecheck`             |
| `npm run test`       | Vitest                                                     |

To check the server-rendered HTML the way a crawler sees it:

```bash
npm run build:node
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

The previous site posted a Slack Block Kit payload to `/slack-proxy.php`.
Cloudflare Pages has no PHP runtime, so that endpoint does not exist here, and
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
replacement endpoint (a Nitro server route or a Cloudflare Pages Function,
holding the webhook URL as a secret and rate-limiting submissions) is a separate
ticket. Until it exists, the email and phone links in the same section still
work.

---

## Deploying

**Nothing here creates a Cloudflare project, deploys, or touches DNS.** This is
configuration only; the deploy itself needs sign-off.

### Cloudflare Pages settings

| Setting                | Value           |
| ---------------------- | --------------- |
| Framework preset       | Nuxt            |
| Build command          | `npm run build` |
| Build output directory | `dist`          |
| Root directory         | `/`             |
| Node version           | `22`            |

`wrangler.toml` in the repo root carries the same output directory plus the
`nodejs_compat` compatibility flag. That flag is **required** — Nitro's
Cloudflare output imports Node built-ins, and without it the Worker fails at
runtime. If the project is created through the dashboard rather than from
`wrangler.toml`, set it under _Settings → Functions → Compatibility flags_ for
both production and preview.

### What the build produces

`nitro.preset` is `cloudflare_pages`. `/` is prerendered at build time, so
Cloudflare serves static HTML with the whole page already in it. The Worker is
still deployed alongside, so a route added later renders on demand with no
config change. Override the preset with `NITRO_PRESET` when building for
somewhere else.

### Deploying by hand

```bash
npm ci
npm run build
npx wrangler pages deploy dist --project-name personal-website
```

---

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: install, audit,
lint, format check, type check, test, build. It is granted `contents: read` and
nothing more, and both actions are pinned to a commit SHA rather than a moving
tag.

### Dependency audit

`npm audit --omit=dev` reports **zero** vulnerabilities, and CI fails if that
changes. There are no runtime `dependencies` in this repo, so that covers
everything that reaches a browser or the Worker.

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
