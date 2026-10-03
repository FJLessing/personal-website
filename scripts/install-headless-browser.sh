#!/usr/bin/env bash
#
# Install a headless Chromium that runs without root.
#
# The container this repo is developed in is Debian with no browser, no X, and
# no sudo. Chromium's shared libraries (libnss3, libgbm1, libpango, ...) are all
# absent and `apt-get install` is not available to us. So we do it in userspace:
#
#   1. point apt at a private state/cache directory and download the runtime
#      dependency .debs (apt still reads the real dpkg status, so it only
#      fetches what is genuinely missing),
#   2. unpack them into a sysroot with `dpkg-deb -x`,
#   3. fetch Playwright's Chromium build,
#   4. write an env.sh that puts the sysroot on LD_LIBRARY_PATH.
#
# Nothing is installed system-wide and nothing is added to package.json.
# Re-running is cheap: each step is skipped when its output already exists.
# Pass --force to redo everything.
#
# Usage:
#   scripts/install-headless-browser.sh [--force]
#   . "$HEADLESS_BROWSER_HOME/env.sh"      # then chromium / screenshot.mjs work
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Default to a sibling of the checkout: ~650 MB of browser does not belong in
# the repo, and keeping it outside means `git clean -xfd` does not bin it.
HEADLESS_BROWSER_HOME="${HEADLESS_BROWSER_HOME:-$(cd "$REPO_ROOT/.." && pwd)/.tools/headless-browser}"

FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

# The Playwright release this installs. Chromium comes from the same release,
# so the two move together.
PLAYWRIGHT_VERSION="1.63.0"

SYSROOT="$HEADLESS_BROWSER_HOME/sysroot"
DRIVER="$HEADLESS_BROWSER_HOME/driver"
BROWSERS="$HEADLESS_BROWSER_HOME/browsers"
WORK="$HEADLESS_BROWSER_HOME/.apt"

# Chromium's shared-library dependencies on Debian 13 (trixie), plus two font
# packages. Without them every glyph renders as a blank box.
APT_PACKAGES=(
  libnss3 libnspr4
  libatk1.0-0t64 libatk-bridge2.0-0t64 libatspi2.0-0t64
  libcups2t64 libdrm2 libgbm1
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2
  libxext6 libx11-6 libxcb1 libexpat1
  libpango-1.0-0 libpangocairo-1.0-0 libcairo2
  libasound2t64 libglib2.0-0t64 libdbus-1-3 libudev1
  fonts-liberation fonts-dejavu-core
)

step() { printf '\n==> %s\n' "$1"; }

if [ "$FORCE" = 1 ]; then
  rm -rf "$SYSROOT" "$BROWSERS" "$DRIVER/node_modules" "$WORK"
fi

mkdir -p "$HEADLESS_BROWSER_HOME/bin" "$DRIVER"

# ---------------------------------------------------------------- 1. sysroot
if [ -e "$SYSROOT/usr/lib/x86_64-linux-gnu/libnss3.so" ]; then
  step "System libraries already unpacked, skipping"
else
  step "Downloading Chromium's runtime dependencies (no root required)"
  mkdir -p "$WORK"/{lists/partial,cache/archives/partial,etc}
  cat > "$WORK/etc/apt.conf" <<EOF
Dir::State::Lists "$WORK/lists";
Dir::Cache "$WORK/cache";
Dir::Cache::archives "$WORK/cache/archives";
Dir::Etc::sourcelist "/etc/apt/sources.list";
Dir::Etc::sourceparts "/etc/apt/sources.list.d";
Dir::State::status "/var/lib/dpkg/status";
Debug::NoLocking "true";
APT::Sandbox::User "root";
EOF
  export APT_CONFIG="$WORK/etc/apt.conf"
  apt-get update
  apt-get install -y --no-install-recommends --download-only "${APT_PACKAGES[@]}"
  unset APT_CONFIG

  step "Unpacking into $SYSROOT"
  mkdir -p "$SYSROOT"
  for deb in "$WORK"/cache/archives/*.deb; do
    dpkg-deb -x "$deb" "$SYSROOT"
  done
  rm -rf "$WORK"
fi

# ----------------------------------------------------------------- 2. driver
# Compare the installed version, not just its presence: an install from before
# the pin (or from an older pin) would otherwise stay put until --force.
INSTALLED_PLAYWRIGHT=""
if [ -f "$DRIVER/node_modules/playwright-core/package.json" ]; then
  INSTALLED_PLAYWRIGHT="$(node -p "require('$DRIVER/node_modules/playwright-core/package.json').version" 2>/dev/null || true)"
fi
DRIVER_CHANGED=0
if [ "$INSTALLED_PLAYWRIGHT" = "$PLAYWRIGHT_VERSION" ]; then
  step "playwright-core $PLAYWRIGHT_VERSION already installed, skipping"
else
  if [ -n "$INSTALLED_PLAYWRIGHT" ]; then
    step "Replacing playwright-core $INSTALLED_PLAYWRIGHT with $PLAYWRIGHT_VERSION"
  else
    step "Installing playwright-core (outside the project's package.json)"
  fi
  DRIVER_CHANGED=1
  [ -f "$DRIVER/package.json" ] || cat > "$DRIVER/package.json" <<'EOF'
{
  "name": "headless-browser-driver",
  "private": true,
  "description": "Container-local Playwright driver. Deliberately not a dependency of the site."
}
EOF
  # Pinned and exact, not @latest. This package downloads a browser binary and
  # then runs it, so whatever @latest resolves to on the day is what executes.
  # Bump PLAYWRIGHT_VERSION deliberately and re-run; the version check above
  # replaces the old one. The audit
  # output is left on, which is why there is no --no-audit here.
  (cd "$DRIVER" && npm install --no-fund --save-exact "playwright-core@$PLAYWRIGHT_VERSION")
fi

# ---------------------------------------------------------------- 3. chromium
# A new driver may want a different Chromium revision. `install chromium` is
# idempotent, so after a driver change it is always run.
if [ "$DRIVER_CHANGED" = 0 ] && compgen -G "$BROWSERS/chromium-*/chrome-linux64/chrome" > /dev/null; then
  step "Chromium already downloaded, skipping"
else
  step "Downloading Chromium"
  PLAYWRIGHT_BROWSERS_PATH="$BROWSERS" \
    node "$DRIVER/node_modules/playwright-core/cli.js" install chromium
fi

# --------------------------------------------------------------------- 4. env
step "Writing env.sh and bin/chromium"

cat > "$HEADLESS_BROWSER_HOME/env.sh" <<'EOF'
# Source this to put the container-local headless Chromium on your environment:
#   . .tools/headless-browser/env.sh
#
# Node resolves bare ESM specifiers by walking up from the importing file, so
# NODE_PATH does not help an `import 'playwright-core'`. Scripts should resolve
# the driver explicitly:
#   const require = createRequire(`${process.env.HEADLESS_BROWSER_HOME}/driver/`)
HEADLESS_BROWSER_HOME="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
export HEADLESS_BROWSER_HOME
_hb_sysroot="$HEADLESS_BROWSER_HOME/sysroot"
export LD_LIBRARY_PATH="$_hb_sysroot/usr/lib/x86_64-linux-gnu:$_hb_sysroot/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export FONTCONFIG_PATH="$_hb_sysroot/etc/fonts"
export XDG_DATA_DIRS="$_hb_sysroot/usr/share:${XDG_DATA_DIRS:-/usr/local/share:/usr/share}"
export PLAYWRIGHT_BROWSERS_PATH="$HEADLESS_BROWSER_HOME/browsers"
export PATH="$HEADLESS_BROWSER_HOME/bin:$PATH"
unset _hb_sysroot
EOF

cat > "$HEADLESS_BROWSER_HOME/bin/chromium" <<'EOF'
#!/usr/bin/env bash
# Headless Chromium with the container-local sysroot on the loader path.
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/env.sh"
exec "$(echo "$PLAYWRIGHT_BROWSERS_PATH"/chromium-*/chrome-linux64/chrome)" \
  --headless=new --no-sandbox --disable-dev-shm-usage --disable-gpu "$@"
EOF
chmod +x "$HEADLESS_BROWSER_HOME/bin/chromium"

step "Verifying"
# shellcheck source=/dev/null
. "$HEADLESS_BROWSER_HOME/env.sh"
missing=$(ldd "$(echo "$BROWSERS"/chromium-*/chrome-linux64/chrome)" | grep -c 'not found' || true)
if [ "$missing" != "0" ]; then
  echo "FAILED: $missing shared libraries still unresolved" >&2
  exit 1
fi
chromium --version

cat <<EOF

Installed to $HEADLESS_BROWSER_HOME

  . "$HEADLESS_BROWSER_HOME/env.sh"
  chromium --version
  node scripts/screenshot.mjs http://127.0.0.1:3000 --out .tmp/shots
EOF
