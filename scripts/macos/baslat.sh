#!/usr/bin/env bash
# AppleIpTv - macOS baslatici.
#
# Bagimliliklari kurar, cekirdegi derler, proxy ve web sunucusunu
# baslatir, tarayiciyi acar. Durdurmak icin Ctrl+C.

set -euo pipefail
cd "$(dirname "$0")/../.."

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  Node.js bulunamadi."
  echo "  Kurmak icin:  brew install node"
  echo "  Homebrew yoksa: https://nodejs.org adresinden LTS surumunu indirin."
  echo
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "  Node.js 20 veya uzeri gerekiyor (su an: $(node -v))."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "  Bagimliliklar kuruluyor, ilk seferde birkac dakika surebilir..."
  npm install
fi

echo "  Cekirdek kutuphane derleniyor..."
npm run build -w @appleiptv/core >/dev/null

# Cikista arka plandaki sunuculari da kapat.
pids=()
cleanup() {
  echo
  echo "  Kapatiliyor..."
  for pid in "${pids[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

echo "  CORS proxy baslatiliyor (canli yayinlar icin gerekli)..."
npm run proxy &
pids+=($!)

echo "  Web sunucusu baslatiliyor..."
npm run dev &
pids+=($!)

sleep 4
open "http://localhost:5173" 2>/dev/null || true

echo
echo "  Hazir:  http://localhost:5173"
echo "  Proxy adresi (Ayarlar > Gelismis):  http://localhost:8787/proxy?url="
echo "  Durdurmak icin Ctrl+C."
echo

wait
