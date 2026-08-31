#!/usr/bin/env bash
# AppleIpTv - Linux ve macOS baslatici.
#
# Bagimliliklari kurar, cekirdegi derler, CORS proxy'si ile web sunucusunu
# baslatir ve tarayiciyi acar. Durdurmak icin Ctrl+C.

set -euo pipefail
# Is denetimi acik: her arka plan isi kendi surec grubunda calisir, boylece
# cikista npm'in altindaki node/vite sureclerini de kapatabiliyoruz.
set -m
cd "$(dirname "$0")/../.."

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  Node.js bulunamadi. Kurulum:"
  echo "    Arch / CachyOS : sudo pacman -S nodejs npm"
  echo "    Fedora         : sudo dnf install nodejs npm"
  echo "    Debian/Ubuntu  : sudo apt install nodejs npm"
  echo "    macOS          : brew install node"
  echo
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "  Node.js 20 veya uzeri gerekiyor (su an: $(node -v))."
  exit 1
fi

# Portlar bosta mi? Doluysa sunucular sessizce basarisiz olur.
port_busy() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | grep -q ":$1 "
  elif command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
  else
    return 1
  fi
}

for port in 5173 8787; do
  if port_busy "$port"; then
    echo
    echo "  Uyari: $port portu zaten kullaniliyor."
    echo "  Muhtemelen uygulama baska bir pencerede acik. Once onu kapatin."
    echo
    exit 1
  fi
done

if [ ! -d node_modules ]; then
  echo "  Bagimliliklar kuruluyor, ilk seferde birkac dakika surebilir..."
  npm install
fi

echo "  Cekirdek kutuphane derleniyor..."
npm run build -w @appleiptv/core >/dev/null

pids=()
cleanup() {
  echo
  echo "  Kapatiliyor..."
  for pid in "${pids[@]:-}"; do
    # Once tum surec grubunu (npm + altindaki node/vite), olmazsa sureci.
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "  CORS proxy baslatiliyor (canli yayinlar icin gerekli)..."
npm run proxy &
pids+=($!)

echo "  Web sunucusu baslatiliyor..."
npm run dev &
pids+=($!)

sleep 4

# Tarayiciyi ac: macOS'ta "open", masaustu Linux'ta "xdg-open".
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:5173" >/dev/null 2>&1 || true
elif command -v open >/dev/null 2>&1; then
  open "http://localhost:5173" >/dev/null 2>&1 || true
fi

echo
echo "  Hazir:  http://localhost:5173"
echo "  Proxy adresi (Ayarlar > Gelismis):  http://localhost:8787/proxy?url="
echo "  Durdurmak icin Ctrl+C."
echo

wait
