# Linux'ta calistirma (CachyOS / Arch)

Web surumu Linux'ta sorunsuz calisir. Asagidaki komutlar CachyOS ve diger
Arch tabanli dagitimlar icindir; paket adlari disinda her sey ayni.

---

## 1. Gerekli paketler

```bash
sudo pacman -S --needed nodejs npm git ffmpeg
```

`ffmpeg` isteğe bagli degil: tarayicilar Linux'ta H.264/AAC cozumunu
sistemdeki ffmpeg kitapliklarina birakir ve IPTV yayinlarinin nerdeyse
tamami H.264/AAC'dir. Eksikse yayin "aciliyor ama goruntu yok" seklinde
sessizce basarisiz olur.

```bash
node -v      # v20 veya uzeri olmali
```

## 2. Projeyi al ve calistir

```bash
cd ~
git clone -b claude/apple-tv-iptv-app-vkd7hf https://github.com/duperious/AppleIpTv.git
cd AppleIpTv
./scripts/unix/baslat.sh
```

Betik bagimliliklari kurar, cekirdegi derler, **CORS proxy'sini** ve web
sunucusunu baslatir, tarayiciyi acar. Ctrl+C hepsini kapatir.

Elle calistirmak isterseniz iki terminal:

```bash
npm install && npm run build -w @appleiptv/core && npm run dev   # 1
npm run proxy                                                     # 2
```

Uygulamada: profil > kaynak ekle > **Ayarlar > Gelismis > CORS proxy
adresi** alanina `http://localhost:8787/proxy?url=`.

## 3. Codec kontrolu (Linux'a ozgu en sik sorun)

Uygulama bunu kendisi olcuyor: **Ayarlar > Yayin tanilama > "Yayini test
et"**. Listedeki **Codec destegi** adimi kirmiziysa tarayiciniz H.264 veya
AAC cozemiyor demektir. Yapilacaklar:

- `sudo pacman -S ffmpeg` (Firefox sistem ffmpeg'ini kullanir)
- Chromium surumunuz tescilli codec'ler olmadan derlenmis olabilir;
  Firefox'u veya tescilli codec iceren bir Chromium/Chrome paketini deneyin
- HEVC (H.265) destegi cogu Linux tarayicisinda yoktur; 4K/HEVC kanallar
  acilmayabilir. Bu kanallari VLC veya mpv ile izleyebilirsiniz:

```bash
mpv "http://sunucu:8080/live/kullanici/sifre/123.ts"
```

## 4. Terminalden yayin tanilama

Tarayiciyi denklemden cikarip saglayiciyi dogrudan test eder:

```bash
npm run tani -- --xtream http://sunucu.com:8080 kullanici sifre
npm run tani -- "http://sunucu.com:8080/live/kullanici/sifre/123.m3u8"
```

## 5. Proxy'yi otomatik baslatma (systemd)

Her seferinde elle baslatmak istemiyorsaniz proxy'yi kullanici servisi
olarak kurun (sudo gerekmez):

```bash
mkdir -p ~/.config/systemd/user
sed "s|/PROJE/YOLU|$PWD|" scripts/linux/appleiptv-proxy.service \
  > ~/.config/systemd/user/appleiptv-proxy.service
systemctl --user daemon-reload
systemctl --user enable --now appleiptv-proxy

systemctl --user status appleiptv-proxy      # durum
journalctl --user -u appleiptv-proxy -f      # gunluk
```

Oturumu kapattiginizda da calismasi icin: `sudo loginctl enable-linger $USER`

Saglayiciniz belirli bir oynatici kimligi bekliyorsa birim dosyasindaki
`UPSTREAM_USER_AGENT` satirini acin.

## 6. Uretim derlemesi

Gelistirme sunucusu yerine derlenmis surum daha hizlidir:

```bash
npm run build
npm run preview -w @appleiptv/web        # http://localhost:4173
```

`apps/web/dist` klasorunu herhangi bir statik sunucuya da koyabilirsiniz.

## 7. Ev agindaki diger cihazlardan erisim

```bash
ip -4 addr show | grep inet              # yerel IP adresiniz
HOST=0.0.0.0 npm run proxy               # proxy'yi aga ac
```

Telefondan `http://<pc-ip>:5173`, proxy adresi olarak da
`http://<pc-ip>:8787/proxy?url=` girin.

Guvenlik duvari kuruluysa portlari acin:

```bash
# firewalld
sudo firewall-cmd --add-port=5173/tcp --add-port=8787/tcp --permanent && sudo firewall-cmd --reload
# ufw
sudo ufw allow 5173/tcp && sudo ufw allow 8787/tcp
```

Proxy acik bir yonlendiricidir; yalnizca ev aginizda kullanin, internete
acmayin. Istersen hedefleri sinirlayin:

```bash
ALLOWED_HOSTS=sunucum.com npm run proxy
```

## 8. Testler

```bash
npm test                                  # birim testleri
npm run build -w @appleiptv/web
npm i -D playwright && npx playwright install chromium
node apps/web/e2e/run.mjs                 # uctan uca senaryolar
```

`npx playwright install chromium` tarayici indirir. Sisteminizdeki
Chromium'u kullanmak isterseniz:

```bash
PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium node apps/web/e2e/run.mjs
```

## Sik sorunlar

**`Permission denied` (betik calismiyor)**
`chmod +x scripts/unix/baslat.sh`

**"5173 portu zaten kullaniliyor"**
Uygulama baska bir terminalde acik. Kapatin ya da farkli port verin:
`npm run dev -w @appleiptv/web -- --port 5200`

**Yayin aciliyor, ses var goruntu yok**
Codec eksigi. Yukaridaki 3. adimi uygulayin.

**Apple TV'ye kurulum**
Linux'tan yapilamaz; Xcode yalnizca macOS'ta calisir. Ayrintilar ve
secenekler icin [`docs/WINDOWS.md`](WINDOWS.md) sonundaki bolume bakin -
ayni kisit Linux icin de gecerlidir.
