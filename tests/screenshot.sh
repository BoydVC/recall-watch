#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${RECALL_WATCH_PORT:-4310}"
CHROME="$(command -v google-chrome || command -v chromium || command -v chromium-browser)"
mkdir -p screenshots dist
if [[ ! -f dist/recall-watch.html ]]; then python3 build.py; fi
if ! ss -ltn | grep -q "127.0.0.1:$PORT "; then
  nohup python3 server.py > /tmp/recall-watch-$PORT.log 2>&1 &
  sleep 1
fi
shot() {
  local url="$1" out="$2" size="$3"; shift 3 || true
  local prof; prof="$(mktemp -d /tmp/rwshot.XXXX)"
  timeout 45 "$CHROME" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --run-all-compositor-stages-before-draw --virtual-time-budget=28000 \
    --window-size="$size" --user-data-dir="$prof" --screenshot="$out" "$@" "$url" >/dev/null 2>&1 || true
  rm -rf "$prof"
  if [[ -f "$out" ]]; then echo "  $out ($(wc -c < "$out") bytes)"; else echo "  FAIL $out"; fi
}
U="http://127.0.0.1:$PORT"
shot "file://$PWD/dist/recall-watch.html#home" screenshots/00-best-home.png 1440,1100
shot "$U/#home" screenshots/00-desktop-home.png 1440,1000
shot "$U/#register" screenshots/01-register.png 1440,1100
shot "$U/#matches" screenshots/02-matches.png 1440,1100
shot "$U/#about" screenshots/03-about.png 1440,1000
shot "$U/#home" screenshots/04-phone.png 390,844 --user-agent="Mozilla/5.0 (iPhone)"
echo "screenshots done"
