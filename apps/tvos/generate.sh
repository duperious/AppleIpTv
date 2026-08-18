#!/usr/bin/env bash
# Xcode projesini uretir. XcodeGen kurulu degilse kurulum komutunu gosterir.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "XcodeGen bulunamadi. Kurmak icin:  brew install xcodegen"
  echo "Alternatif olarak README.md icindeki 'Elle proje olusturma' adimlarini izleyin."
  exit 1
fi

xcodegen generate
echo "Hazir: apps/tvos/AppleIpTv.xcodeproj"
echo "Acmak icin:  open AppleIpTv.xcodeproj"
