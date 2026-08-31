# MacBook'ta test etme

MacBook iki sey icin de yeterli: web surumunu calistirmak **ve** Apple TV
uygulamasini gercekten Apple TV 4K'ya kurmak. Windows'ta mumkun olmayan
ikinci kisim burada mumkun.

---

## 1. Hazirlik

```bash
# Node.js (yoksa)
brew install node          # veya https://nodejs.org > LTS

node -v                    # v20 veya uzeri gorunmeli
```

Depoyu alin:

```bash
cd ~/Desktop
git clone -b claude/apple-tv-iptv-app-vkd7hf https://github.com/duperious/AppleIpTv.git
cd AppleIpTv
```

> Kodun tamami `claude/apple-tv-iptv-app-vkd7hf` dalinda.

## 2. Web surumunu calistirma

Tek komut:

```bash
./scripts/unix/baslat.sh
```

Bu betik bagimliliklari kurar, cekirdegi derler, **CORS proxy'sini** ve web
sunucusunu baslatir, tarayiciyi acar. Ctrl+C hepsini kapatir.

Elle yapmak isterseniz iki ayri terminal:

```bash
# 1. terminal
npm install
npm run build -w @appleiptv/core
npm run dev

# 2. terminal
npm run proxy
```

Uygulamada: profil olusturun > kaynak ekleyin > **Ayarlar > Gelismis >
CORS proxy adresi** alanina `http://localhost:8787/proxy?url=` yazin.

## 3. Canli yayin acilmiyorsa: once terminalden test edin

Bu, tarayiciyi denklemden cikarir ve sorunun **saglayicida mi** yoksa
**tarayici tarafinda mi** oldugunu kesin olarak soyler:

```bash
# Xtream hesabiyla (en pratik)
npm run tani -- --xtream http://sunucu.com:8080 kullanici sifre

# veya dogrudan bir yayin adresiyle
npm run tani -- "http://sunucu.com:8080/live/kullanici/sifre/123.m3u8"
```

Arac sunlari yapar:

- Hesabi dogrular, abonelik bitisini ve izin verilen bicimleri gosterir
- Ilk canli kanalin adresini kurar
- Ayni adresi **tarayici kimligi** ve **oynatici (VLC) kimligi** ile dener -
  saglayici tarayiciyi engelliyorsa bu adimda ortaya cikar
- `.m3u8` acilmazsa `.ts` bicimini (veya tersini) otomatik dener
- Yonlendirmeleri takip eder, ana liste > varyant liste > gercek parca
  zincirini indirir
- Sonunda ne yapilmasi gerektigini yazar

Cikti kopyalanabilir; kullanici adi ve sifre maskelenir.

### Ek kontrol: VLC

```bash
brew install --cask vlc
```

VLC'de **Dosya > Ag Akisini Ac** ile ayni adresi deneyin. VLC de acamiyorsa
sorun kesinlikle saglayicidadir (abonelik, es zamanli baglanti siniri,
bolge kisiti); uygulamada yapilabilecek bir sey yoktur.

### Safari notu

Safari HLS'i yerel olarak oynatir. Uygulama Safari'de `.m3u8` yayinlari
tarayicinin kendi oynaticisina verir; bu genellikle **daha uyumludur**.
Chrome'da acilmayan bir kanal Safari'de acilabilir - denemeye deger.

---

## 4. Apple TV 4K'ya kurma

Windows'ta mumkun degildi, MacBook ile mumkun. Ozet:

```bash
brew install xcodegen
cd apps/tvos
./generate.sh
open AppleIpTv.xcodeproj
```

Sonra Xcode'da:

1. **Xcode > Settings > Accounts** > Apple kimliginizi ekleyin (ucretsiz hesap yeterli).
2. Hedef `AppleIpTv` > **Signing & Capabilities**: "Automatically manage
   signing" isaretli, Team = kendi hesabiniz, Bundle Identifier'i
   benzersiz yapin (orn. `com.adiniz.appleiptv`).
3. Apple TV'de **Ayarlar > Uzaktan Kumandalar ve Aygitlar > Uzak Uygulama ve
   Aygitlar** ekranini acin (Mac ile ayni Wi-Fi'da olsun).
4. Xcode > **Window > Devices and Simulators** > Apple TV'yi secip ekrandaki
   kodu girin.
5. Ust cubuktan hedef cihaz olarak Apple TV'yi secip **Run** (⌘R).

Ayrintili anlatim ve elle proje olusturma adimlari:
[`apps/tvos/README.md`](../apps/tvos/README.md)

**7 gun kurali:** Ucretsiz Apple kimligiyle imzalanan uygulama 7 gun sonra
acilmaz olur; Xcode'dan tekrar **Run** demek yeterlidir, veriler cihazda
kalir. Yillik 99 dolarlik gelistirici hesabiyla bu sure 1 yila cikar.

**Apple TV'de proxy gerekmez.** CORS yalnizca tarayici kurali oldugu icin
tvOS uygulamasi yayinlari dogrudan alir; web surumundeki canli yayin
sorunlari orada yasanmaz.

---

## 5. Gelistirme ve testler

```bash
npm test                    # cekirdek birim testleri
npm run typecheck           # TypeScript denetimi
npm run build               # cekirdek + web derlemesi

# Uctan uca testler (gercek Chromium, sahte IPTV sunucusu)
npm run build -w @appleiptv/web
npm i -D playwright && npx playwright install chromium
node apps/web/e2e/run.mjs
```

Uctan uca paket, gercek dunyadaki zorlu saglayicilari da taklit eder:
CORS basligi gondermeyen, tarayici User-Agent'ini reddeden, adresi baska
bir yola yonlendiren ve goreli adresli oynatma listeleri veren sunucular.

## Sik sorunlar

**`./scripts/unix/baslat.sh: Permission denied`**
`chmod +x scripts/unix/baslat.sh` calistirin.

**"Port 5173 kullanimda"**
`npm run dev -w @appleiptv/web -- --port 5200`

**Kanal aciliyor ama goruntu yok**
Xtream kaynaklarinda **Ayarlar > Gelismis > "HLS tercih et"** acik olsun;
M3U adresinde `&output=m3u8` bulunsun. Yayin H.265/HEVC ise Safari deneyin.

**Proxy calisiyor ama saglayici yine reddediyor**
Bazi saglayicilar belirli bir oynatici kimligi bekler:

```bash
UPSTREAM_USER_AGENT="Kodi/20.2" npm run proxy
```
