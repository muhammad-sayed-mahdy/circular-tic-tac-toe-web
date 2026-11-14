#!/usr/bin/env sh
# Tiny static file server launcher for Linux / macOS (the Windows equivalent is serve.ps1).
# Usage:  sh serve.sh [port]        (default port 8080)
# It uses whichever common tool is already installed - nothing is downloaded except by `npx`.
PORT="${1:-8080}"
cd "$(dirname "$0")" || exit 1
echo "Serving $(pwd) at http://localhost:$PORT/  (Ctrl+C to stop)"

if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PORT" --bind 127.0.0.1
elif command -v python >/dev/null 2>&1; then
  exec python -m http.server "$PORT" --bind 127.0.0.1
elif command -v php >/dev/null 2>&1; then
  exec php -S "127.0.0.1:$PORT"
elif command -v ruby >/dev/null 2>&1; then
  exec ruby -run -e httpd . -p "$PORT" -b 127.0.0.1
elif command -v busybox >/dev/null 2>&1; then
  exec busybox httpd -f -p "127.0.0.1:$PORT"
elif command -v npx >/dev/null 2>&1; then
  exec npx --yes serve -l "$PORT" .
else
  echo "No suitable server found. Install one of: python3, php, ruby, busybox or Node.js (npx)." >&2
  exit 1
fi
