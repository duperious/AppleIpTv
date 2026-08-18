# AppleIpTv - Apple TV (tvOS) uygulamasi

SwiftUI + AVKit ile yazilmis, M3U ve Xtream Codes destekli IPTV oynatici.
Apple TV 4K (tvOS 17+) icin tasarlanmistir.

## Gereksinimler

- macOS calistiran bir Mac
- Xcode 15 veya uzeri (App Store'dan ucretsiz)
- Apple TV ve Mac'in **ayni Wi-Fi agina** bagli olmasi
- Bir Apple kimligi (ucretsiz hesap yeterli)

## 1. Xcode projesini olustur

### Yontem A - XcodeGen (onerilen, tek komut)

```bash
brew install xcodegen        # bir kez
cd apps/tvos
./generate.sh
open AppleIpTv.xcodeproj
```

### Yontem B - Elle proje olusturma (XcodeGen kurmadan)

1. Xcode > **File > New > Project** > **tvOS** > **App** > Next
2. Product Name: `AppleIpTv`, Interface: **SwiftUI**, Language: **Swift**
3. Projeyi bu deponun disinda bir yere kaydedin.
4. Xcode'un olusturdugu `ContentView.swift` ve `AppleIpTvApp.swift`
   dosyalarini **silin** (Move to Trash).
5. Finder'dan `apps/tvos/AppleIpTv` klasorundeki
   `AppleIpTvApp.swift`, `Models/`, `Services/`, `Views/` klasorlerini
   Xcode'daki proje agacina surukleyin.
   Acilan pencerede **Copy items if needed** ve **Create groups** isaretli olsun.
6. Projedeki `Assets.xcassets` yerine bu depodaki
   `apps/tvos/AppleIpTv/Assets.xcassets` icerigini kullanabilirsiniz
   (veya kendi ikonlarinizi ekleyin).
7. Hedefin **Info** sekmesinde `App Transport Security Settings >
   Allow Arbitrary Loads` degerini **YES** yapin. Cogu IPTV sunucusu duz
   HTTP kullandigi icin bu sart.

## 2. Imzalama

1. Xcode > **Settings > Accounts** > `+` > Apple kimliginizi ekleyin.
2. Proje > hedef `AppleIpTv` > **Signing & Capabilities**:
   - **Automatically manage signing** isaretli
   - **Team**: kendi Apple kimliginiz (Personal Team)
   - **Bundle Identifier**: benzersiz bir deger, orn. `com.adiniz.appleiptv`

## 3. Apple TV'yi eslestir

1. Apple TV'de: **Ayarlar > Uzaktan Kumandalar ve Aygitlar >
   Uzak Uygulama ve Aygitlar** (bu ekran acik kalsin).
2. Mac'te Xcode > **Window > Devices and Simulators** > Apple TV'nizi secin.
3. Ekranda cikan 6 haneli kodu Xcode'a girin.

## 4. Calistir

Xcode'un ust cubugundan hedef cihaz olarak Apple TV'yi secip **Run** (⌘R).
Ilk derleme birkac dakika surebilir. Uygulama Apple TV'nin ana ekranina
eklenir.

### 7 gun kurali

Ucretsiz Apple kimligiyle imzalanan uygulamalar **7 gun** sonra acilmaz olur.
Cozum: Apple TV'yi tekrar baglayip Xcode'dan **Run** demek. Profiller,
kaynaklar ve izleme gecmisi cihazda kalir, yeniden kurulum gerekmez.
Ucretli Apple Developer Program uyeligiyle (yillik) bu sure 1 yila cikar.

## Kullanim

- **Ilk acilis:** profil olusturun, ardindan Xtream veya M3U bilgilerinizi girin.
- **Canli TV:** solda kategori, ortada kanal listesi, sagda o an yayinda olan
  program. Kanala bir kez basmak secer, ikinci basis oynatir.
- **Rehber:** zaman cizelgesinde ilerleyip programa basarak kanali acabilirsiniz.
- **Diziler:** sezon secin, bolume basin; kaldiginiz yerden devam eder.
- **Ayarlar:** kaynak ekleme/yenileme, PIN, kategori gizleme/kilitleme,
  EPG saat kaymasi, tum verileri silme.

## Mimari

| Dosya | Gorevi |
| --- | --- |
| `Models/Models.swift` | Tum veri modelleri (Codable) |
| `Services/M3UParser.swift` | M3U/M3U8 ayristirma, canli/film/dizi ayrimi |
| `Services/XMLTVParser.swift` | Olay tabanli XMLTV (EPG) ayristirici |
| `Services/XtreamClient.swift` | Xtream Codes API istemcisi ve adres uretimi |
| `Services/HTTP.swift` | Ag katmani + gzip acma |
| `Services/Persistence.swift` | JSON dosyalariyla kalici depolama |
| `Services/AppStore.swift` | Merkezi uygulama durumu (ObservableObject) |
| `Views/PlayerView.swift` | AVPlayerViewController sarmalayicisi |
| `Views/*` | SwiftUI ekranlari |

### Neden MPEG-TS yerine HLS?

tvOS'un `AVPlayer`'i ham MPEG-TS akislarini oynatmaz. Bu yuzden Xtream
kanallari icin daima `.m3u8` ucu kullanilir
(`/live/kullanici/sifre/1234.m3u8`). Saglayiciniz HLS sunmuyorsa kanal
acilmaz; bu Apple'in oynatici sinirlamasidir.

## Sorun giderme

**"Yayin acilamiyor" / siyah ekran**
- ATS ayarini (`Allow Arbitrary Loads = YES`) kontrol edin.
- Kanalin `.m3u8` bicimini destekledigini dogrulayin. Xtream panelinizin
  "allowed output formats" listesinde `m3u8` olmali.
- Ayni anda izin verilen baglanti sayisini asmis olabilirsiniz.

**Kaynak eklenmiyor**
- Sunucu adresini `http://sunucu.com:8080` bicimine getirin (sonda `/` olmasin).
- Kullanici adi/sifreyi tarayicida `http://sunucu:port/player_api.php?username=...&password=...`
  adresiyle dogrulayin.

**EPG gelmiyor**
- Xtream hesaplarinda rehber otomatik indirilir; M3U kaynaklarinda
  playlist icinde `url-tvg` yoksa EPG adresini elle girin.
- Kanal adlari rehberdekiyle cok farkliysa eslesme kurulamayabilir.

**Saatler kayik**
- Ayarlar > EPG saat kaymasi ile duzeltin (bazi saglayicilar UTC gonderir).
