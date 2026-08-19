# Sorun giderme

## Web surumu

### "Failed to fetch" / CORS hatasi
Tarayici, IPTV sunucusuna dogrudan istek atamiyor. Cozum:

```bash
npm run proxy
```

Ardindan **Ayarlar > Gelismis > CORS proxy adresi** alanina
`http://localhost:8787/proxy?url=` yazin ve kaynagi yenileyin.

Yalnizca kendi saglayicina izin vermek icin:

```bash
ALLOWED_HOSTS=sunucum.com,cdn.sunucum.com npm run proxy
```

### Filmler/diziler oynuyor ama canli yayinlar acilmiyor

Bu, web surumunde en sik karsilasilan durumdur ve sebebi tarayicidir:

- Film ve dizi dosyalari dogrudan `<video>` etiketiyle oynatilir; tarayici
  bunlarda CORS denetimi yapmaz.
- Canli yayinlar (HLS/MPEG-TS) parca parca **JavaScript ile** indirilir ve
  CORS denetimine takilir. Cogu IPTV sunucusu `Access-Control-Allow-Origin`
  basligi gondermedigi icin tarayici indirmeyi reddeder.

Cozum: proxy'yi calistirin ve **Ayarlar > Gelismis > CORS proxy adresi**
alanina adresini yazin.

```bash
npm run proxy
# Ayarlar > Gelismis > CORS proxy adresi:  http://localhost:8787/proxy?url=
```

Oynatici, yayin acilmadiginda ekranda sebebini yazar ve "Yeniden dene"
sunar. Canli bir `.ts` adresi acilmazsa ayni yayinin `.m3u8` bicimi
otomatik denenir.

Apple TV uygulamasinda bu sinirlama yoktur; proxy gerekmez.

### Kanal aciliyor ama goruntu yok
- Xtream kaynaklarinda **Ayarlar > Gelismis > "HLS tercih et"** secenegini
  acin. Tarayicilar ham MPEG-TS akislarini `mpegts.js` ile oynatabilir ancak
  HLS cok daha kararlidir.
- Yayin H.265/HEVC ise Chrome oynatamayabilir; Safari deneyin.

### Uygulama yavas acildi
Cok buyuk playlistlerde (100.000+ kayit) ilk ayristirma birkac saniye surer.
Katalog IndexedDB'ye yazildigi icin sonraki acilislar hizlidir.
Ayarlar > "Katalog tazeleme araligi" ile yenileme sikligini dusurebilirsiniz.

### Verileri sifirlamak
Ayarlar > **Tum verileri sil**. Bu islem profilleri, kaynaklari, favorileri ve
izleme gecmisini tarayicidan siler.

## Apple TV surumu

`apps/tvos/README.md` icindeki "Sorun giderme" bolumune bakin.

## Kaynak bicimleri

### Xtream Codes
Saglayicinin verdigi uc bilgi yeterlidir:

```
Sunucu : http://ornek-sunucu.com:8080
Kullanici : abc123
Sifre : xyz789
```

Uygulama sunucudan sunlari cagirir:
`player_api.php` (kategoriler, kanallar, filmler, diziler),
`xmltv.php` (EPG), `live|movie|series/...` (oynatma adresleri).

### M3U
Genellikle su bicimde bir adres verilir:

```
http://ornek-sunucu.com:8080/get.php?username=abc123&password=xyz789&type=m3u_plus&output=m3u8
```

`type=m3u_plus` kanal logolari ve grup adlarini icerir; `output=m3u8` ise
web tarafinda daha uyumludur.

### EPG (XMLTV)
`.xml` veya `.xml.gz` olabilir. Playlist icindeki `#EXTM3U url-tvg="..."`
satiri varsa otomatik kullanilir.
