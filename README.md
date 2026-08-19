# AppleIpTv

Apple TV 4K ve web tarayicisi icin **ucretsiz, acik kaynak IPTV oynatici**.
M3U/M3U8 playlistleri ve Xtream Codes hesaplariyla calisir; profil, favori,
EPG rehberi, kaldigin yerden devam ve ebeveyn kilidi gibi gelismis
ozellikleri destekler.

App Store'a uygulama koymak yillik geliistirici ucreti gerektirdigi icin bu
proje **kaynak kod olarak** dagitilir: Apple TV'ye kendi Apple kimliginle
(ucretsiz hesapla) Xcode uzerinden yuklersin, web surumunu de tarayicida
veya kendi sunucunda calistirirsin.

> **Not:** Uygulama hicbir yayin icerigi barindirmaz veya saglamaz. Yalnizca
> kendi aboneliginizin M3U/Xtream bilgilerini oynatir. Icerigin yasalligindan
> kullanici sorumludur.

---

## Icindekiler

| Klasor | Ne ise yarar |
| --- | --- |
| `packages/core` | M3U, XMLTV ve Xtream ayristiricilari; katalog, arama, profil ve ilerleme mantigi (TypeScript, birim testli) |
| `apps/web` | Tarayici arayuzu (React + Vite). Dizustu/telefon icin. |
| `apps/tvos` | Apple TV uygulamasi (SwiftUI + AVKit). |
| `apps/proxy` | Web surumunde CORS engelini asmak icin kucuk yerel proxy. |
| `docs/` | Sorun giderme ve mimari notlari. |

---

## Ozellikler

**Kaynaklar**
- Xtream Codes girisi (sunucu adresi + kullanici adi + sifre)
- M3U / M3U8 playlist adresi veya dosyasi (web surumunde dosya yukleme)
- Birden fazla kaynak ekleyip tek katalogda birlestirme, kaynagi gecici kapatma
- Abonelik bitis tarihi, kanal/film/dizi sayilari, tek tusla yenileme

**Icerik**
- Canli TV: kategori listesi, kanal arama, favoriler, kanal numarasi
- Filmler ve diziler: kategori, siralama (ad/yil/puan), afis, konu, oyuncular
- Diziler: sezon ve bolum listesi, bolumden devam etme, sonraki bolume gecis
- M3U kaynaklarinda "Dizi Adi S01 E02" bicimindeki bolumler otomatik olarak
  sezonlara gruplanir

**EPG (yayin akisi)**
- XMLTV rehberi (duz veya `.gz` sikistirilmis) indirilir ve ayristirilir
- Kanal listesinde "su an yayinda" ve "sirada" bilgisi
- Zaman cizelgeli rehber ekrani; programa tiklayinca kanal acilir
- `tvg-id` bos olan kanallar icin ad benzerligiyle otomatik eslestirme
- Saat dilimi kaymasi ayari

**Profiller**
- Birden cok profil, emoji avatar
- Profil basina favori, izleme gecmisi, son izlenen kanallar ve ayarlar
- SHA-256 ile saklanan PIN; profil kilidi
- Cocuk profili: yetiskin kategorileri otomatik gizlenir
- Kategori gizleme ve PIN ile kategori kilitleme

**Oynatma**
- Apple TV: yerel `AVPlayer` (altyazi/ses secimi, PiP, "Now Playing" ekrani)
- Web: HLS (`hls.js`), MPEG-TS (`mpegts.js`) ve dogrudan dosya oynatma
- Kaldigi yerden devam, ilerleme cubugu, otomatik ilerleme kaydi
- Canli yayinda yukari/asagi ile kanal degistirme, kalite secimi, tampon ayari

---

## Hizli baslangic (web)

```bash
npm install
npm run build        # cekirdek kutuphaneyi derler
npm run dev          # http://localhost:5173
```

Ilk acilista bir profil olusturun, ardindan **Kaynak ekle** ekranindan
Xtream bilgilerinizi veya M3U adresinizi girin.

### CORS uyarisi

Tarayicilar, IPTV sunucularina dogrudan yapilan isteklerde cogu zaman CORS
engeline takilir (sunucular `Access-Control-Allow-Origin` basligi gondermez).
Film ve diziler bundan etkilenmez (dogrudan `<video>` ile oynatilirlar) ama
**canli yayinlar JavaScript ile indirildigi icin proxy olmadan acilmaz.**
Bunun icin depoda kucuk bir proxy var:

```bash
npm run proxy        # http://localhost:8787
```

Sonra uygulamada **Ayarlar > Gelismis > CORS proxy adresi** alanina
`http://localhost:8787/proxy?url=` yazin.

Proxy acik bir yonlendiricidir; yalnizca kendi makinenizde calistirin.
Istersen `ALLOWED_HOSTS=sunucum.com npm run proxy` ile yalnizca kendi
saglayicina izin verebilirsin.

### Uretim derlemesi

```bash
npm run build -w @appleiptv/web
# apps/web/dist klasorunu herhangi bir statik sunucuya koyabilirsiniz
```

Uygulama bir PWA'dir; Safari/Chrome'da "Ana ekrana ekle" ile tam ekran
calisir. Tum veriler tarayicinin IndexedDB'sinde tutulur, sunucuya hicbir
sey gonderilmez.

### Windows kullaniyorsaniz

Adim adim kurulum, tek tikla baslatma dosyasi ve Windows'a ozel sorun
giderme icin: [`docs/WINDOWS.md`](docs/WINDOWS.md).
`scripts\windows\AppleIpTv-Baslat.bat` dosyasina cift tiklamak yeterlidir.

---

## Apple TV 4K'ya kurulum

Detayli anlatim: [`apps/tvos/README.md`](apps/tvos/README.md)

Ozet:

1. Bir Mac ve **Xcode 15+** gerekir (ucretsiz).
2. `cd apps/tvos && ./generate.sh` (XcodeGen ile projeyi uretir) veya
   README'deki elle proje olusturma adimlarini izleyin.
3. Xcode'da hedefin **Signing & Capabilities** sekmesinde kendi ucretsiz
   Apple kimliginizi secin, bundle identifier'i benzersiz yapin
   (orn. `com.adiniz.appleiptv`).
4. Apple TV'yi Mac ile ayni aga baglayin, tvOS'ta
   **Ayarlar > Uzaktan Kumandalar ve Aygitlar > Uzak Uygulama ve Aygitlar**
   ekranini acin; Xcode'da **Window > Devices and Simulators** ile cihazi
   eslestirin.
5. Hedef cihaz olarak Apple TV'yi secip **Run** deyin.

**Ucretsiz Apple kimligiyle uygulama 7 gun sonra acilmaz olur;** Xcode'dan
tekrar Run demek yeterlidir (veriler cihazda kalir). Ucretli gelistirici
hesabiyla bu sure 1 yila cikar.

---

## Mimari

```
packages/core (TypeScript)          apps/tvos (Swift)
├── parsers/m3u.ts      ─────────── Services/M3UParser.swift
├── parsers/xmltv.ts    ─────────── Services/XMLTVParser.swift
├── xtream/client.ts    ─────────── Services/XtreamClient.swift
├── library/catalog.ts  ─────────── Services/AppStore.swift
└── library/profiles.ts ───────────┘
```

Web ve tvOS ayni veri modelini ve ayni ayristirma kurallarini uygular; her
platform kendi dilinde yazilmistir (tvOS'ta JavaScript calistirmak yerine
yerel SwiftUI/AVKit kullanmak akiciligi ve uzaktan kumanda uyumunu korur).

Veri akisi her iki platformda da ayni: **kaynak -> katalog -> dizin ->
gorunum**. Katalog ve EPG yerel olarak saklanir (web'de IndexedDB, tvOS'ta
Application Support altinda JSON), boylece uygulama acilista aninda dolu gelir
ve arka planda tazelenir.

## Gelistirme

```bash
npm test                    # cekirdek kutuphane birim testleri (vitest, 42 test)
npm run typecheck           # TypeScript tur denetimi
npm run build               # cekirdek + web derlemesi
```

### Uctan uca testler

`apps/web/e2e` altinda, sahte bir IPTV sunucusuna karsi gercek Chromium'da
calisan senaryolar var: M3U ayristirma + EPG rehberi, Xtream girisi ve
oynatma adresi uretimi, gercek video oynatma ile ilerleme kaydi.

```bash
npm run build -w @appleiptv/web
npm i -D playwright && npx playwright install chromium
node apps/web/e2e/run.mjs
```

Ayrintilar: [`apps/web/e2e/README.md`](apps/web/e2e/README.md)

## Lisans

MIT. Ayrintilar icin `LICENSE` dosyasina bakin.
