#!/usr/bin/env bash
# Geriye donuk uyumluluk icin ince sarmalayici.
# Asil betik Linux ve macOS icin ortak: scripts/unix/baslat.sh
exec "$(dirname "$0")/../unix/baslat.sh" "$@"
