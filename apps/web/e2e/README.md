# Uctan uca testler

Gercek bir Chromium'da, gercek bir HTTP sunucusuna karsi calisan senaryolar.
`mock-server.mjs` bir IPTV saglayicisini taklit eder: M3U playlist, XMLTV
rehberi, Xtream Codes `player_api.php` uclari ve oynatilabilir bir video.

## Calistirma

```bash
npm run build -w @appleiptv/web            # once uretim derlemesi
npm i -D playwright                         # tek seferlik
npx playwright install chromium             # tek seferlik
node apps/web/e2e/run.mjs
```

Hazir bir Chromium'unuz varsa indirme adimini atlayabilirsiniz:

```bash
PLAYWRIGHT_CHROMIUM_PATH=/yol/chrome node apps/web/e2e/run.mjs
```

Playwright bilerek `package.json`a eklenmedi; kurulumu tarayici indirdigi
icin normal `npm install` akisini agirlastiriyor.

## Kapsam

| Senaryo | Ne dogrulaniyor |
| --- | --- |
| M3U akisi | Playlist ayristirma, kanal/film/dizi ayrimi, EPG eslesmesi ve rehber cizelgesi, dizi bolum gruplama, arama, favorilerin yenilemeden sonra kalmasi |
| Xtream akisi | Kimlik dogrulama, katalog cekme, `live/movie` oynatma adreslerinin dogru uretilmesi |
| Oynatma ve ilerleme | Gercek video oynatma, klavye kisayollari (bosluk, ok tuslari, Escape), cikista ilerleme kaydi ve "bitti" isaretlemesi |

`fixtures-video.webm` testler icin uretilmis 12 saniyelik bir desen videosudur.
