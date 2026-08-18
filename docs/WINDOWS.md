# Windows PC'de kullanim

Web surumu Windows'ta tam olarak calisir: Chrome, Edge veya Firefox'ta acilir,
tum veriler (profiller, kaynaklar, favoriler, izleme gecmisi) sadece kendi
bilgisayarinizda kalir.

---

## 1. Node.js kurun

1. <https://nodejs.org> adresine gidin.
2. **LTS** yazan buyuk butondan Windows kurulumunu (`.msi`) indirin.
3. Kurulumu varsayilan ayarlarla tamamlayin, bilgisayari yeniden baslatmaniza gerek yok.

Kontrol etmek icin **Baslat > PowerShell** acip:

```powershell
node -v
```

`v20...` veya `v22...` gibi bir surum gorunmeli.

## 2. Projeyi indirin

**Git kuruluysa** (yoksa alttaki ZIP yontemini kullanin):

```powershell
cd $HOME\Desktop
git clone -b claude/apple-tv-iptv-app-vkd7hf https://github.com/duperious/AppleIpTv.git
cd AppleIpTv
```

**ZIP ile:** GitHub'da depoyu acin, ust soldan `claude/apple-tv-iptv-app-vkd7hf`
dalini secin, yesil **Code > Download ZIP** deyin ve masaustune cikartin.

> Kodun tamami bu dalda. Varsayilan dalda (`main`) henuz yok.

## 3. Baslatin

### Kolay yol

`scripts\windows\AppleIpTv-Baslat.bat` dosyasina cift tiklayin.

Bu dosya sirasiyla:
- eksikse bagimliliklari kurar (ilk seferde birkac dakika surer),
- cekirdek kutuphaneyi derler,
- proxy ve web sunucusunu ayri pencerelerde baslatir,
- tarayicida <http://localhost:5173> adresini acar.

Kapatmak icin acilan iki siyah pencereyi kapatmaniz yeterli.

### Elle yol (PowerShell)

```powershell
cd $HOME\Desktop\AppleIpTv
npm install
npm run build -w @appleiptv/core
npm run dev
```

Tarayicida <http://localhost:5173> adresini acin.

CORS proxy'si icin **ikinci bir PowerShell penceresi** acip:

```powershell
cd $HOME\Desktop\AppleIpTv
npm run proxy
```

## 4. Kaynagi ekleyin

1. Acilan sayfada bir profil olusturun.
2. **Kaynak ekle** ekraninda:
   - **Xtream Codes**: saglayicinizin verdigi sunucu adresi, kullanici adi ve sifre.
   - **M3U adresi**: `http://sunucu:port/get.php?username=...&password=...&type=m3u_plus&output=m3u8`
   - **M3U dosyasi**: elinizde `.m3u` dosyasi varsa dogrudan yukleyin.
3. Kaynak eklenmiyorsa veya "Failed to fetch" hatasi aliyorsaniz:
   **Ayarlar > Gelismis > CORS proxy adresi** alanina

   ```
   http://localhost:8787/proxy?url=
   ```

   yazip kaynagi tekrar deneyin. (Proxy penceresi acik olmali.)

---

## Telefondan / tabletten ayni agda kullanmak

Bilgisayar acikken ev aginizdaki diger cihazlardan da acabilirsiniz.

1. Bilgisayarin yerel IP adresini ogrenin:

   ```powershell
   ipconfig | Select-String IPv4
   ```

   Ornegin `192.168.1.35`.

2. Proxy'yi tum aga acin (varsayilan olarak yalnizca kendi bilgisayarinizi dinler):

   ```powershell
   $env:HOST="0.0.0.0"; npm run proxy
   ```

3. Telefonun tarayicisinda `http://192.168.1.35:5173` adresini acin.
   Telefondaki uygulamada proxy adresini `http://192.168.1.35:8787/proxy?url=`
   olarak girin (her cihaz kendi ayarini tutar).

4. Windows Guvenlik Duvari ilk seferde izin soracaktir; **Ozel aglar** icin izin verin.

iPhone/iPad'de Safari ile acip **Paylas > Ana Ekrana Ekle** derseniz uygulama
tam ekran, uygulama gibi calisir.

---

## Kalici kurulum (surekli calissin isterseniz)

Gelistirme sunucusu yerine derlenmis surumu calistirmak daha hizlidir:

```powershell
npm run build
npm run preview -w @appleiptv/web
```

Adres yine <http://localhost:4173> uzerinden acilir.
`apps\web\dist` klasorunu istediginiz statik sunucuya da kopyalayabilirsiniz.

---

## Sik karsilasilan sorunlar

**"npm : Bu sistemde betik calistirma devre disi birakildigindan..."**
PowerShell betik kisitlamasi. Ya `cmd.exe` kullanin ya da bir kez su komutu calistirin:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

**"Port 5173 kullanimda"**
Baska bir program portu tutuyor. Farkli bir port verin:

```powershell
npm run dev -w @appleiptv/web -- --port 5200
```

**Kaynak eklenmiyor, "Failed to fetch"**
Proxy penceresi acik mi ve Ayarlar'daki proxy adresi dogru mu kontrol edin.
Sunucu adresini `http://sunucu.com:8080` bicimine getirin (sonda `/` olmasin).

**Kanal aciliyor ama goruntu yok**
- Xtream kaynaklarinda **Ayarlar > Gelismis > "HLS tercih et"** secenegini acin.
- M3U adresinin sonuna `&output=m3u8` ekleyin.
- Yayin H.265/HEVC ise Chrome oynatamayabilir; Edge veya Firefox deneyin.

**Antivirus/Defender uyarisi**
`.bat` dosyasi yalnizca `npm` komutlari calistirir; icerigini not defterinde
acip gorebilirsiniz. Guvenmiyorsaniz "Elle yol" adimlarini kullanin.

---

## Apple TV'ye kurulum Windows'tan yapilamaz

Bunu net soyleyeyim: Apple TV'ye uygulama yuklemek **Xcode** gerektirir ve
Xcode yalnizca macOS'ta calisir. Windows'tan Apple TV'ye uygulama
yuklemenin desteklenen bir yolu yok. Secenekleriniz:

1. **Bir Mac'e yarim saat erisim** (arkadas, is yeri, Apple Store).
   Mac ile Apple TV'nin **ayni Wi-Fi aginda** olmasi gerekir; bu yuzden
   kiralik "bulut Mac" hizmetleri iste yaramaz - cihazinizi goremezler.
   Kurulum adimlari: [`apps/tvos/README.md`](../apps/tvos/README.md).
   Ucretsiz Apple kimligiyle uygulama 7 gunde bir yeniden yuklenmeli;
   yillik 99 dolarlik gelistirici hesabiyla bu sure 1 yila cikar (ama yine
   de Mac gerekir).

2. **Mac'e hic erisiminiz yoksa:** web surumunu telefonunuzda acip goruntuyu
   Apple TV'ye **AirPlay** ile aktarabilirsiniz. iPhone/iPad'de Safari ile
   `http://<pc-ip>:5173` adresini acin, bir yayin baslatin ve videonun
   uzerindeki AirPlay simgesinden Apple TV'yi secin. Bu yontemin calismasi
   icin yayinin HLS olmasi gerekir: Xtream kaynaklarinda "HLS tercih et"
   acik olmali, M3U adreslerinde `output=m3u8` bulunmali.
   (iPhone Safari, `.ts` uzantili ham yayinlari oynatamaz.)
