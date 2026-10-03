# Deploying personal-website behind Apache

This is the by-hand procedure for putting [fjlessing.co.za](https://www.fjlessing.co.za)
on your own server. The shape is:

```
browser ──TLS──▶ Apache :443 ──plain HTTP──▶ node .output/server/index.mjs on 127.0.0.1:3000
                    │                              │
                    └─ terminates TLS,             └─ Nitro SSR server, kept alive by systemd
                       compresses, sets
                       security + cache headers
```

Apache is the only thing on a public port. The Node process listens on loopback
only and is never reachable from the internet directly.

Everything here runs on free software. Nothing in this guide requires a paid
service or a paid tier.

**Placeholders used throughout — substitute your own:**

| Placeholder            | Meaning                 | Value used in the examples |
| ---------------------- | ----------------------- | -------------------------- |
| `fjlessing.co.za`      | apex domain             | —                          |
| `www.fjlessing.co.za`  | canonical host          | matches `SITE_META.url`    |
| `/srv/fjlessing.co.za` | deploy root             | —                          |
| `fjlessing`            | non-root service user   | —                          |
| `3000`                 | loopback port for Nitro | —                          |

---

## 1. Requirements

### On the server

| Thing   | Version                 | Why                                                                                                                       |
| ------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Node    | **22.x** (see `.nvmrc`) | `.nvmrc` pins `22` and CI builds on 22. `package.json` allows `>=20.19.0`, but deploy what CI tested.                     |
| npm     | 10+                     | Ships with Node 22. Needed only to build, not to run.                                                                     |
| Apache  | **2.4.7 or newer**      | The vhost below uses `Header setifempty` (2.4.7+) and `Header … expr=` (2.4.10+). Debian 12 / Ubuntu 22.04+ ship 2.4.52+. |
| certbot | any                     | Free Let's Encrypt certificates. `apt install certbot python3-certbot-apache`.                                            |

Check what you have:

```bash
node -v          # expect v22.x
apachectl -v     # expect Server version: Apache/2.4.x
```

If the distro Node is older than 22, install from NodeSource or use `nvm` for the
build user. Node only has to be 22 on whichever machine runs `npm run build`;
the runtime needs 20.19+ but there is no reason to split them.

### Apache modules

```bash
sudo a2enmod proxy proxy_http headers ssl rewrite deflate expires
sudo systemctl restart apache2
```

Confirm they loaded:

```bash
apachectl -M | grep -E 'proxy_module|proxy_http|headers|ssl|rewrite|deflate|expires'
```

What each one is for:

| Module       | Used for                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------- |
| `proxy`      | base reverse-proxy machinery                                                                                  |
| `proxy_http` | proxying HTTP/1.1 to the Node server                                                                          |
| `headers`    | security headers, `Cache-Control`, `X-Forwarded-Proto`                                                        |
| `ssl`        | TLS termination on `:443`                                                                                     |
| `rewrite`    | the `:80` → `:443` redirect                                                                                   |
| `deflate`    | gzip — **Nitro does not compress anything**, so without this every HTML and JS response goes out uncompressed |
| `expires`    | `Expires`/`Cache-Control` for the unhashed files in `public/`                                                 |

**`proxy_wstunnel` is not needed.** The production site opens no WebSocket and no
EventSource — the only long-lived connection Nuxt makes is the dev server's HMR
socket, and the dev server is never deployed. Enable it only if you later proxy
something that actually needs it.

---

## 2. Build

The build runs from a clean checkout. It can run on the server or on your
machine; the output is portable between Linux hosts with the same Node major.

```bash
git clone https://github.com/FJLessing/personal-website.git
cd personal-website
npm ci          # installs from the lockfile; `nuxt prepare` runs on postinstall
npm run build   # default preset is node-server — no NITRO_PRESET needed
```

`npm run build` must finish with:

```
[nitro] ✔ You can preview this build using node .output/server/index.mjs
```

### What `.output/` contains

```
.output/
  nitro.json            build metadata: preset, Nitro and Nuxt versions, build date
  public/               everything served as a static file
    index.html          `/` is prerendered at build time — the full page, as HTML
    _payload.json       the prerendered route's data payload
    _nuxt/              hashed JS/CSS bundles (e.g. entry.hBqxuVnq.css)
    bg/                 prerendered /bg/* demo routes
    favicon.ico, profile.png, site.webmanifest, … (copied from public/)
  server/
    index.mjs           the entry point you run
    chunks/             the bundled server build
    node_modules/       the runtime dependencies, already vendored in
    package.json        lists those vendored dependencies, for reference only
```

### What to copy to the server

**`.output/` and nothing else.** No `node_modules`, no `package.json`, no source.

`npm run build` vendors every runtime dependency into
`.output/server/node_modules` (Vue, vue-router, unhead, devalue and friends).
The project's top-level `node_modules` is build-time only — **it is not needed at
runtime and must not be copied.** You never run `npm ci` or `npm install` on the
server unless you are also building there.

Verify that claim yourself before trusting it:

```bash
# from a directory with no node_modules of its own
cd /tmp && mkdir -p outtest && cp -r /path/to/.output outtest/ && cd outtest
PORT=3999 node .output/server/index.mjs
```

If it serves a page, the output is self-contained.

---

## 3. Run

### Environment variables

| Variable   | Value        | Notes                                                                                                           |
| ---------- | ------------ | --------------------------------------------------------------------------------------------------------------- |
| `HOST`     | `127.0.0.1`  | **Loopback only.** Apache is the public face; the Node server must not accept outside connections.              |
| `PORT`     | `3000`       | Must match the `ProxyPass` target in the vhost.                                                                 |
| `NODE_ENV` | `production` | Not strictly required — the build is already a production build — but set it so anything that reads it behaves. |

Nothing else is read from the environment at runtime.

### The service user and directory layout

```bash
sudo useradd --system --home /srv/fjlessing.co.za --shell /usr/sbin/nologin fjlessing
sudo mkdir -p /srv/fjlessing.co.za/releases
sudo chown -R fjlessing:fjlessing /srv/fjlessing.co.za
```

Releases are timestamped directories with a `current` symlink pointing at the
live one. That is what makes the update and rollback in section 7 atomic.

```
/srv/fjlessing.co.za/
  releases/
    20260115T0930/.output/…
    20260122T1412/.output/…
  current -> releases/20260122T1412
```

### Environment file

```bash
sudo install -o root -g fjlessing -m 0640 /dev/null /etc/fjlessing-website.env
```

`/etc/fjlessing-website.env`:

```ini
HOST=127.0.0.1
PORT=3000
NODE_ENV=production
```

Mode `0640` root:fjlessing — the service reads it, nobody else does. If a secret
ever belongs in here, this is already the right permission.

### systemd unit

`/etc/systemd/system/fjlessing-website.service`:

```ini
[Unit]
Description=fjlessing.co.za Nuxt SSR server
Documentation=https://github.com/FJLessing/personal-website/blob/main/DEPLOYMENT.md
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=fjlessing
Group=fjlessing
WorkingDirectory=/srv/fjlessing.co.za/current
EnvironmentFile=/etc/fjlessing-website.env
ExecStart=/usr/bin/node /srv/fjlessing.co.za/current/.output/server/index.mjs
Restart=always
RestartSec=2
KillSignal=SIGTERM
TimeoutStopSec=20

# Logs go to the journal; see the log commands below.
StandardOutput=journal
StandardError=journal
SyslogIdentifier=fjlessing-website

# Hardening. The app writes nothing to disk, so it needs no write access at all.
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictSUIDSGID=true
LockPersonality=true
MemoryDenyWriteExecute=false

[Install]
WantedBy=multi-user.target
```

Two notes on that unit:

- `WorkingDirectory` is the `current` symlink. systemd resolves it when the
  service starts, so a symlink swap followed by a restart picks up the new
  release. `ExecStart` deliberately goes through the same symlink.
- `MemoryDenyWriteExecute=false` is explicit, not an oversight — V8 JITs, so it
  needs W+X pages. Setting it `true` stops Node from starting.
- `/usr/bin/node` — check with `command -v node`. If you installed Node through
  `nvm` it will be somewhere under `~/.nvm` and will not be readable by a system
  user; install Node system-wide (NodeSource or the distro) for the service.

### Start, stop, status, logs

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now fjlessing-website     # start now and on every boot

sudo systemctl start fjlessing-website
sudo systemctl stop fjlessing-website
sudo systemctl restart fjlessing-website
sudo systemctl status fjlessing-website

# logs
journalctl -u fjlessing-website -f                # follow
journalctl -u fjlessing-website -n 200 --no-pager # last 200 lines
journalctl -u fjlessing-website --since "1 hour ago"
```

A healthy start logs one line:

```
Listening on http://127.0.0.1:3000
```

Prove it before you touch Apache:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/   # 200
curl -sS http://127.0.0.1:3000/ | grep -o 'id="experience"' | wc -l # 1
```

---

## 4. Apache vhost

Two files. Put them in `/etc/apache2/sites-available/` and enable with
`a2ensite`.

### `/etc/apache2/sites-available/fjlessing.co.za.conf` — port 80

Port 80 exists for exactly two reasons: the ACME challenge, and redirecting
everyone to HTTPS.

```apache
<VirtualHost *:80>
    ServerName  www.fjlessing.co.za
    ServerAlias fjlessing.co.za

    # Let's Encrypt http-01 renewal must stay reachable on :80, un-redirected.
    # This has to come before the rewrite below.
    DocumentRoot /var/www/html
    <Directory /var/www/html/.well-known/acme-challenge>
        Require all granted
        Options None
    </Directory>

    RewriteEngine On
    RewriteCond %{REQUEST_URI} !^/\.well-known/acme-challenge/
    RewriteRule ^/?(.*)$ https://www.fjlessing.co.za/$1 [R=301,L]

    ErrorLog  ${APACHE_LOG_DIR}/fjlessing.co.za-http-error.log
    CustomLog ${APACHE_LOG_DIR}/fjlessing.co.za-http-access.log combined
</VirtualHost>
```

No HSTS header here. HSTS on a plaintext response is ignored by browsers and is
meaningless — it belongs on `:443` only.

### `/etc/apache2/sites-available/fjlessing.co.za-le-ssl.conf` — port 443

```apache
<IfModule mod_ssl.c>

# ---------------------------------------------------------------------------
# The real site. www only.
# ---------------------------------------------------------------------------
<VirtualHost *:443>
    ServerName www.fjlessing.co.za

    # ---- TLS -------------------------------------------------------------
    # Issued free by Let's Encrypt:
    #   sudo certbot --apache -d fjlessing.co.za -d www.fjlessing.co.za
    # certbot writes these exact paths and renews them twice a month via its
    # own systemd timer. Verify the timer with:
    #   systemctl list-timers | grep certbot
    SSLEngine on
    SSLCertificateFile    /etc/letsencrypt/live/fjlessing.co.za/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/fjlessing.co.za/privkey.pem
    Include /etc/letsencrypt/options-ssl-apache.conf

    # ---- Reverse proxy ---------------------------------------------------
    # Keep the browser's Host header so the app sees the public hostname and
    # not 127.0.0.1.
    ProxyPreserveHost On

    # Never act as a forward proxy.
    ProxyRequests Off

    # mod_proxy_http sets X-Forwarded-For, X-Forwarded-Host and X-Forwarded-Server
    # by itself. It does NOT set X-Forwarded-Proto — without this line anything
    # behind the proxy that asks "was this HTTPS?" gets the wrong answer.
    RequestHeader set X-Forwarded-Proto "https"
    RequestHeader set X-Forwarded-Port  "443"

    ProxyPass        / http://127.0.0.1:3000/ retry=0 timeout=30 connectiontimeout=5
    ProxyPassReverse / http://127.0.0.1:3000/

    # ---- Compression -----------------------------------------------------
    # Nitro serves everything uncompressed, so this is the only gzip on the
    # path. mod_deflate adds `Vary: Accept-Encoding` on its own.
    <IfModule mod_deflate.c>
        AddOutputFilterByType DEFLATE \
            text/html text/plain text/css text/xml \
            application/javascript application/json \
            application/manifest+json application/ld+json \
            image/svg+xml
        # Already-compressed formats: leave them alone.
        SetEnvIfNoCase Request_URI \.(?:gif|jpe?g|png|webp|avif|ico|woff2?|zip|gz)$ no-gzip dont-vary
    </IfModule>

    # ---- Caching ---------------------------------------------------------
    # Three non-overlapping rules. Each response gets its Cache-Control from
    # exactly one of them, so nothing is set twice.
    #
    # 1. /_nuxt/ — filenames are content-hashed (entry.hBqxuVnq.css), so the
    #    bytes behind a URL never change. Nitro already sends
    #    `public, max-age=31536000, immutable` for these. `setifempty` keeps
    #    Apache from duplicating it, and still covers the case where a future
    #    Nitro version stops sending it.
    <LocationMatch "^/_nuxt/">
        Header setifempty Cache-Control "public, max-age=31536000, immutable"
    </LocationMatch>

    # 2. HTML — the SSR'd page, matched on content type rather than path so
    #    every route is covered. Nitro sends no Cache-Control at all for HTML,
    #    which lets browsers heuristically cache off Last-Modified. `no-cache`
    #    means "revalidate before reuse", not "never store" — the ETag still
    #    gets you a 304 on an unchanged page.
    #    `set`, not `always set`: caching policy only matters on a successful
    #    response, and the normal headers table is where CONTENT_TYPE is
    #    reliably populated.
    Header set Cache-Control "no-cache" "expr=%{CONTENT_TYPE} =~ m#^text/html#"

    # 3. public/ assets — profile.png, the favicons, the manifest. Unhashed
    #    filenames, so a long cache would pin a stale logo. mod_expires owns
    #    Cache-Control for these types; mod_headers does not touch them.
    <IfModule mod_expires.c>
        ExpiresActive On
        ExpiresByType image/png                 "access plus 1 day"
        ExpiresByType image/x-icon              "access plus 1 day"
        ExpiresByType image/vnd.microsoft.icon  "access plus 1 day"
        ExpiresByType image/svg+xml             "access plus 1 day"
        ExpiresByType application/manifest+json "access plus 1 day"
    </IfModule>

    # ---- Security headers (see section 5) --------------------------------
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Header always set X-Content-Type-Options "nosniff"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
    Header always set Permissions-Policy "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"
    Header always set Content-Security-Policy "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; manifest-src 'self'; upgrade-insecure-requests"

    # Nitro stamps `X-Powered-By: Nuxt` on its error responses. It tells an
    # attacker what to look up and nobody else anything. `always` because the
    # responses that carry it are exactly the non-2xx ones.
    Header always unset X-Powered-By

    # Apache's own version/OS banner. Belongs in apache2.conf really, but it is
    # listed here so the vhost is complete on its own terms:
    #   ServerTokens Prod
    #   ServerSignature Off

    ErrorLog  ${APACHE_LOG_DIR}/fjlessing.co.za-error.log
    CustomLog ${APACHE_LOG_DIR}/fjlessing.co.za-access.log combined
</VirtualHost>
</IfModule>
```

Enable and reload:

```bash
sudo a2ensite fjlessing.co.za fjlessing.co.za-le-ssl
sudo apachectl configtest      # must print: Syntax OK
sudo systemctl reload apache2
```

> `ProxyPassReverse` is the real directive name — there is no `ProxyReversePass`.
> It rewrites `Location`, `Content-Location` and `URI` headers on redirects
> coming back from Nitro so they do not leak `http://127.0.0.1:3000`.

---

## 5. Security headers

### Where each header is set, and why

| Header                       | Set in  | Reason                                                                                                                                               |
| ---------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Strict-Transport-Security`  | Apache  | A statement about the TLS connection. The app does not know whether TLS was used; Apache does.                                                       |
| `X-Content-Type-Options`     | Apache  | One value, every response, including Apache's own error pages. The app never sees a request that Apache rejects.                                     |
| `Referrer-Policy`            | Apache  | Same: one site-wide value, no per-route variation.                                                                                                   |
| `Permissions-Policy`         | Apache  | Same.                                                                                                                                                |
| `Content-Security-Policy`    | Apache  | Same — until the app needs a per-request nonce (see below), at which point it has to move.                                                           |
| `X-Powered-By` (unset)       | Apache  | Nitro sets it on error responses. Stripping it at the proxy covers every path, including ones the app never reaches.                                 |
| `Content-Type`               | **App** | Nitro knows the type of each response. Apache must not override it, which is exactly what `nosniff` relies on.                                       |
| `Cache-Control` on `/_nuxt/` | **App** | Nitro already emits `public, max-age=31536000, immutable` because it knows the filenames are content-hashed. Apache uses `setifempty`, so it defers. |
| `ETag` / `Last-Modified`     | **App** | Nitro computes these from the response body.                                                                                                         |

**On a 200 the app sets no security headers.** There is no `routeRules`, no
`nitro.routeRules`, and no server middleware setting headers — confirmed by
`curl -D -` against the Node server, which returns only `Content-Type`, `ETag`,
`Last-Modified`, `Content-Length`, `Date` and the keep-alive pair.

**On an error it does.** A 404 from the Node server carries Nitro's own
defensive set: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: no-referrer`, `Content-Security-Policy: script-src 'none';
frame-ancestors 'none';` — and `X-Powered-By: Nuxt`, which the vhost unsets.
Nothing is duplicated, because `Header always set` **replaces** rather than
appends: Apache's value is the one that reaches the browser. `X-Frame-Options`
is the one survivor on paths Apache does not touch, and it says the same thing
as `frame-ancestors 'none'`.

If a future change adds headers in `nuxt.config.ts` via `routeRules`, **delete
the matching line from the vhost at the same time.** Two `Content-Security-Policy`
headers do not merge — the browser enforces the intersection, which is almost
never what either author intended, and is a very annoying bug to find.

### The CSP, directive by directive

Every value below was derived from the actual rendered HTML of a production
build, not guessed:

| Directive                                                       | Why                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default-src 'self'`                                            | Backstop for anything not named.                                                                                                                                                                                                                                                 |
| `script-src 'self' 'unsafe-inline'`                             | Bundles come from `/_nuxt/` (self). `'unsafe-inline'` is required by two inline blocks Nuxt emits: the import map (`{"imports":{"#entry":"/_nuxt/…"}}`) and the runtime-config script (`window.__NUXT__.config = …`). See the honest note below.                                 |
| `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` | `entry.*.css` is self. Google Fonts serves the `@font-face` stylesheet. `'unsafe-inline'` covers the one `<style>` block in the head — the `noscript` rule in `nuxt.config.ts` — plus Vue's `style="display:none"` attribute. The scoped background CSS is bundled, not inlined. |
| `font-src 'self' https://fonts.gstatic.com`                     | Google Fonts serves the actual woff2 files from `gstatic`, a different origin from the stylesheet. Both are needed.                                                                                                                                                              |
| `img-src 'self'`                                                | The only image is `/profile.png`, plus the favicons and manifest icons. No `data:` URIs anywhere in the HTML or the CSS — verified with `grep`. Add `data:` only if that changes.                                                                                                |
| `connect-src 'self'`                                            | Hydration fetches `/_payload.json`. Nothing else makes a request. If a contact endpoint is ever added, keep it same-origin and this stays as it is.                                                                                                                              |
| `manifest-src 'self'`                                           | `/site.webmanifest`.                                                                                                                                                                                                                                                             |
| `frame-ancestors 'none'`                                        | Clickjacking. This supersedes `X-Frame-Options`, which is why that header is deliberately absent — setting both just means maintaining two things that say the same thing.                                                                                                       |
| `base-uri 'none'`                                               | Stops an injected `<base>` from repointing every relative URL on the page.                                                                                                                                                                                                       |
| `object-src 'none'`                                             | No plugins, ever.                                                                                                                                                                                                                                                                |
| `form-action 'self'`                                            | The page has no form today. This pins any POST to this origin if one is ever added, and stops an injected form posting elsewhere.                                                                                                                                                |
| `upgrade-insecure-requests`                                     | Belt and braces for any `http://` URL that sneaks into content.                                                                                                                                                                                                                  |

**On `'unsafe-inline'` for scripts — say it plainly:** this is the weak part of
the policy. Nuxt emits those two inline blocks on every render and their content
includes the build id, so a static hash in the vhost would break on every
deploy. Tightening it properly means a per-request nonce threaded from the
server render into the header, which the app does not do today and which cannot
be bolted on from Apache alone — Apache cannot know a nonce the app never told it
about. That is an app-side change and its own ticket. Until then the CSP still
buys real protection: no third-party script origin can execute, `base-uri` and
`object-src` are shut, and framing is denied.

**On HSTS:** `max-age=31536000; includeSubDomains` commits every subdomain of
`fjlessing.co.za` to HTTPS for a year, in every browser that has visited. Make
sure no subdomain is HTTP-only before you enable it. `preload` is deliberately
not in the value — getting onto the preload list is easy and getting off it takes
months, so add it only as a conscious decision.

**On `Permissions-Policy`:** every listed feature is denied outright (`=()`),
because the site uses none of them. The syntax is the current structured one;
the old `Feature-Policy` header is dead and is not set.

---

## 6. Verification

Run these after the service and the vhost are both up. Each one checks a thing
that can independently be wrong.

### The Node server itself (bypassing Apache)

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/
# expect: 200
```

### SSR actually works through the proxy

The point of SSR is that the HTML contains the page before any JavaScript runs.
`curl` sees exactly what a crawler sees, so this is the real check — not the
browser, which would render fine even if the server sent an empty shell.

Fetch the page once and check it three ways:

```bash
curl -sS https://www.fjlessing.co.za/ > /tmp/home.html
```

All six sections are present:

```bash
grep -o -E 'id="(hero|about|experience|skills|interests|contact)"' /tmp/home.html | sort -u
# expect six lines: id="about" id="contact" id="experience" id="hero" id="interests" id="skills"
```

All five section headings rendered:

```bash
grep -o -E '<h2[^>]*><span>' /tmp/home.html | wc -l
# expect: 5   (About, Work Experience, Skills, Recent Interests, Get In Touch)
```

The real copy, not just the shell:

```bash
grep -o 'I lead a talented team of developers' /tmp/home.html | wc -l   # expect: 2
grep -o 'University of Pretoria'               /tmp/home.html | wc -l   # expect: 1
grep -o 'Head of Development'                  /tmp/home.html | wc -l   # expect: non-zero
```

The first two are body copy from `app/content/site.ts` and the counts are exact
for the current content. `Head of Development` appears in the title, the meta
description, the Open Graph and Twitter tags, the JSON-LD and two sections — the
count drifts whenever copy changes, so only `0` is meaningful there.

> Use `grep -o … | wc -l`, not `grep -c`. Nitro emits the whole body on one
> line, so `grep -c` counts that single line and always answers `1` — which
> looks like a pass no matter how much content is missing.

If the ids are there but the copy is not, SSR is broken and the page is being
built client-side. That is a regression, not a cosmetic issue.

### Status codes

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://www.fjlessing.co.za/            # 200
curl -sS -o /dev/null -w '%{http_code}\n' https://www.fjlessing.co.za/bg/one      # 200
curl -sS -o /dev/null -w '%{http_code}\n' https://www.fjlessing.co.za/nope        # 404
curl -sS -o /dev/null -w '%{http_code}\n' https://www.fjlessing.co.za/favicon.ico # 200
```

### HTTP redirects to HTTPS

```bash
curl -sS -o /dev/null -D - http://www.fjlessing.co.za/ | head -5
# expect: HTTP/1.1 301 Moved Permanently
#         Location: https://www.fjlessing.co.za/

# apex → www, still 301, still HTTPS
curl -sS -o /dev/null -D - https://fjlessing.co.za/ | grep -i '^location'
# expect: location: https://www.fjlessing.co.za/

# and the ACME path must NOT redirect
curl -sS -o /dev/null -w '%{http_code}\n' http://www.fjlessing.co.za/.well-known/acme-challenge/test
# expect: 404 (not 301) — a 301 here breaks certificate renewal
```

### Headers

```bash
curl -sS -o /dev/null -D - https://www.fjlessing.co.za/ \
  | grep -i -E 'strict-transport|content-security|x-content-type|referrer-policy|permissions-policy|cache-control|content-encoding'
```

Expect one line each for HSTS, CSP, nosniff, Referrer-Policy and
Permissions-Policy; `cache-control: no-cache` for the HTML. **Exactly one line
per header name** — two means something is setting it twice.

Compression:

```bash
curl -sS -H 'Accept-Encoding: gzip' -o /dev/null -D - https://www.fjlessing.co.za/ \
  | grep -i -E 'content-encoding|vary'
# expect: content-encoding: gzip
#         vary: Accept-Encoding
```

Hashed asset caching (substitute the real filename from the page source):

```bash
curl -sS -o /dev/null -D - https://www.fjlessing.co.za/_nuxt/entry.hBqxuVnq.css \
  | grep -i cache-control
# expect exactly one: cache-control: public, max-age=31536000, immutable
```

### TLS

```bash
curl -sS -o /dev/null -w '%{ssl_verify_result}\n' https://www.fjlessing.co.za/
# expect: 0

echo | openssl s_client -connect www.fjlessing.co.za:443 -servername www.fjlessing.co.za 2>/dev/null \
  | openssl x509 -noout -dates -subject
```

---

## 7. Updating and rolling back

The `releases/` + `current` symlink layout makes both of these one command each.

### Deploy a new version

Build somewhere that is not the live directory, then swap.

```bash
set -eu
RELEASE="$(date -u +%Y%m%dT%H%M)"
ROOT=/srv/fjlessing.co.za

# 1. Build (on a build host, or in a scratch checkout on the server)
git clone --depth 1 https://github.com/FJLessing/personal-website.git /tmp/pw-$RELEASE
cd /tmp/pw-$RELEASE
npm ci
npm run build

# 2. Ship only .output/ into a new release directory
sudo -u fjlessing mkdir -p "$ROOT/releases/$RELEASE"
sudo rsync -a --delete .output/ "$ROOT/releases/$RELEASE/.output/"
sudo chown -R fjlessing:fjlessing "$ROOT/releases/$RELEASE"

# 3. Swap the symlink atomically (ln -sfn + mv, never rm then ln)
sudo -u fjlessing ln -sfn "$ROOT/releases/$RELEASE" "$ROOT/current.new"
sudo -u fjlessing mv -Tf "$ROOT/current.new" "$ROOT/current"

# 4. Restart — systemd re-resolves the symlink on start
sudo systemctl restart fjlessing-website
```

Step 3 is the part that matters: `mv -T` over an existing symlink is a single
`rename(2)`, so there is no instant where `current` does not exist. Doing
`rm current && ln -s …` instead leaves a window where the service cannot start.

Then wait for readiness and confirm, rather than assuming:

```bash
for i in $(seq 1 30); do
  curl -sfS -o /dev/null http://127.0.0.1:3000/ && { echo "up after ${i}s"; break; }
  sleep 1
done
curl -sS https://www.fjlessing.co.za/ | grep -o 'id="experience"' | wc -l  # expect 1
```

**How much downtime is that?** One process restart — Nitro boots in well under a
second, and Apache returns 502 for requests that land in the gap. On a personal
site that is acceptable. If it is not, run a second instance on `PORT=3001`,
start the new release there, then flip the vhost's `ProxyPass` target and
`systemctl reload apache2` — a reload drains existing connections rather than
dropping them, and the downtime becomes zero at the cost of maintaining two
units. Do not add that complexity until you want it.

### Roll back

The previous release is still on disk, already built. Point at it and restart:

```bash
ROOT=/srv/fjlessing.co.za
ls -1 "$ROOT/releases"                                    # pick the previous one
readlink "$ROOT/current"                                  # what is live now

PREVIOUS=20260115T0930
sudo -u fjlessing ln -sfn "$ROOT/releases/$PREVIOUS" "$ROOT/current.new"
sudo -u fjlessing mv -Tf "$ROOT/current.new" "$ROOT/current"
sudo systemctl restart fjlessing-website
```

Rollback involves no build and no network, so it is seconds. Nothing about a
release directory is mutated after it is created, which is what makes rolling
back to it safe.

Prune old releases occasionally — each is a couple of megabytes:

```bash
cd /srv/fjlessing.co.za/releases && ls -1t | tail -n +6 | xargs -r sudo rm -rf
```

That keeps the five most recent. Never prune the one `current` points at; the
`ls -1t | tail -n +6` above only ever touches releases older than the five
newest, and `current` is normally the newest.

---

## 8. Troubleshooting

### Apache returns 502 Bad Gateway

Apache could not reach the Node server. Work from the inside out.

```bash
# 1. Is the service running at all?
sudo systemctl status fjlessing-website
journalctl -u fjlessing-website -n 50 --no-pager

# 2. Is anything listening on the expected port?
sudo ss -ltnp | grep ':3000'
# expect: LISTEN 0 511 127.0.0.1:3000 … users:(("node",pid=…))

# 3. Does it answer locally?
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/

# 4. What did Apache actually say?
sudo tail -50 /var/log/apache2/fjlessing.co.za-error.log
```

The usual causes, in the order they actually happen:

- **The service is not running.** `Restart=always` restarts a crash, but not a
  process that fails to start at all. The journal will say why — a missing
  `.output`, a bad `WorkingDirectory`, or `node` not on the path.
- **`PORT` and `ProxyPass` disagree.** The env file says 3000, the vhost says 3001. Check both.
- **The server bound to the wrong interface.** If `ss` shows `0.0.0.0:3000` your
  `HOST` is not being applied — and worse, the Node server is exposed directly.
  Fix the env file and restart.
- **SELinux is blocking the proxy connection** (RHEL/Fedora/Rocky, not Debian).
  Error log says "Permission denied: AH00957: HTTP: attempt to connect … failed".
  Fix: `sudo setsebool -P httpd_can_network_connect 1`.
- **A slow first response hit the timeout.** `timeout=30` in `ProxyPass` is
  generous for this site; if you are hitting it, the problem is the app, not the
  proxy.

### The app sees the wrong host or protocol

Symptoms: generated URLs point at `127.0.0.1:3000`, a redirect sends the browser
to `http://` and loops, or a redirect from the app lands on the wrong hostname.

- **`ProxyPreserveHost On` must be present.** Without it Apache rewrites `Host`
  to `127.0.0.1:3000` and the app sees that.
- **`RequestHeader set X-Forwarded-Proto "https"` must be present.**
  `mod_proxy_http` sets `X-Forwarded-For`, `X-Forwarded-Host` and
  `X-Forwarded-Server` automatically but **not** `X-Forwarded-Proto` — this is
  the single most common cause of an HTTPS site believing it is on HTTP.
- **`ProxyPassReverse` must mirror `ProxyPass`.** It rewrites `Location` headers
  on the way back; without it an app redirect leaks the internal origin into the
  browser's address bar.
- **A redirect loop between Apache and the app** usually means both are trying
  to force HTTPS and the app cannot see that TLS already happened. The vhost
  above owns the redirect; the app does no redirecting at all.

Check what the backend is being told:

```bash
curl -sS -o /dev/null -D - -H 'Host: www.fjlessing.co.za' http://127.0.0.1:3000/
```

Today the site's canonical URL, `og:url` and JSON-LD all come from `SITE_META`
in `app/content/site.ts` — they are fixed strings and do not depend on the
request host. So a Host-header mistake will not show up in the metadata; it will
show up the first time any code calls `useRequestURL()`. Keep the two headers
correct anyway, so that day is uneventful.

### Port already in use

```
Error: listen EADDRINUSE: address already in use 127.0.0.1:3000
```

Something else holds the port — usually an older copy of this same service
started by hand and never stopped.

```bash
sudo ss -ltnp | grep ':3000'          # find the PID
sudo systemctl stop fjlessing-website # stop the managed one first
# if a stray process remains:
sudo kill <pid>
sudo systemctl start fjlessing-website
```

If you deliberately need a different port, change it in **both**
`/etc/fjlessing-website.env` and the vhost's `ProxyPass`/`ProxyPassReverse`,
then `systemctl restart fjlessing-website && apachectl configtest && systemctl reload apache2`.

Never "fix" this by running the service as root on port 80. Apache owns the
public ports.

### Permission errors on the service user

```
Error: EACCES: permission denied, open '/srv/fjlessing.co.za/current/.output/…'
```

```bash
# What does the tree actually look like?
sudo ls -la /srv/fjlessing.co.za /srv/fjlessing.co.za/releases
sudo readlink -f /srv/fjlessing.co.za/current

# Can the service user traverse and read it?
sudo -u fjlessing test -r /srv/fjlessing.co.za/current/.output/server/index.mjs && echo readable

# Reset ownership after an rsync that ran as root
sudo chown -R fjlessing:fjlessing /srv/fjlessing.co.za
sudo find /srv/fjlessing.co.za -type d -exec chmod 755 {} +
sudo find /srv/fjlessing.co.za -type f -exec chmod 644 {} +
```

Other things that produce the same error:

- **The env file is unreadable.** It is `0640 root:fjlessing`; if the group is
  wrong the unit fails before `ExecStart` with
  `Failed to load environment files`.
- **A parent directory is not traversable.** `/srv` and every directory down to
  the release need `x` for the service user. `namei -l /srv/fjlessing.co.za/current/.output/server/index.mjs`
  shows exactly where the chain breaks.
- **`ProtectSystem=strict` is doing its job.** The unit gives the app a
  read-only filesystem on purpose. If a future change needs to write somewhere,
  add a specific `ReadWritePaths=` for that one directory rather than loosening
  the whole setting.
- **`node` is inside a user's `nvm` directory.** A system user cannot read
  `/home/you/.nvm/…`. Install Node system-wide.

Whatever the cause, the journal has it:

```bash
journalctl -u fjlessing-website -n 100 --no-pager
```
