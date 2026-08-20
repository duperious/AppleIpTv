#!/usr/bin/env node
/**
 * AppleIpTv yayin tanilama (terminal).
 *
 * Tarayiciyi denklemden cikarir: yayini dogrudan saglayicidan indirmeyi
 * dener. Boylece sorunun saglayicida mi (kimlik dogrulama, User-Agent
 * kisiti, abonelik) yoksa tarayici tarafinda mi (CORS, proxy) oldugu
 * kesin olarak ayirt edilir.
 *
 * Kullanim:
 *   node scripts/tani.mjs "http://sunucu:8080/live/kul/sifre/123.m3u8"
 *   node scripts/tani.mjs --xtream http://sunucu:8080 kullanici sifre
 *   node scripts/tani.mjs <adres> --proxy "http://localhost:8787/proxy?url="
 *   node scripts/tani.mjs <adres> --ua "Kodi/20"
 */

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Chrome/120 Safari/537.36';
const PLAYER_UA = 'VLC/3.0.20 LibVLC/3.0.20';
const TIMEOUT_MS = 15_000;

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const proxyBase = flag('--proxy');
const customUA = flag('--ua');

/**
 * Ciktida kimlik bilgilerini maskeler: sorgu parametrelerindeki sifreyi ve
 * Xtream adres semasindaki (/live/kullanici/sifre/123) kullanici ile sifreyi.
 */
function mask(text) {
  return String(text)
    .replace(/(password=)[^&\s]+/gi, '$1***')
    .replace(/(username=)[^&\s]+/gi, '$1***')
    .replace(
      /\/(live|movie|series)\/([^/\s]+)\/([^/\s]+)\//gi,
      (_match, kind) => `/${kind}/***/***/`,
    );
}

function withProxy(url) {
  if (!proxyBase) return url;
  return /[?&][^=&]+=$/.test(proxyBase)
    ? `${proxyBase}${encodeURIComponent(url)}`
    : `${proxyBase}${proxyBase.includes('?') ? '&' : '?'}url=${encodeURIComponent(url)}`;
}

async function request(url, userAgent) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': userAgent, Accept: '*/*' },
      redirect: 'follow',
      signal: controller.signal,
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      type: response.headers.get('content-type') ?? '',
      bytes: buffer.length,
      text: buffer.subarray(0, 2048).toString('utf8'),
      ms: Date.now() - started,
    };
  } catch (error) {
    return { error: error?.name === 'AbortError' ? 'zaman asimi' : String(error?.message ?? error) };
  } finally {
    clearTimeout(timer);
  }
}

function classify(result) {
  if (!result || result.error) return 'ulasilamadi';
  const head = result.text.trimStart().slice(0, 200).toLowerCase();
  if (head.startsWith('#extm3u')) return 'HLS oynatma listesi';
  if (result.text.charCodeAt(0) === 0x47) return 'MPEG-TS akisi';
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) return 'HTML sayfasi (yayin degil)';
  if (head.startsWith('{') || head.startsWith('[')) return 'JSON (yayin degil)';
  return `ikili veri (${result.type || 'tur bilinmiyor'})`;
}

const lines = [];
const say = (text = '') => {
  lines.push(text);
  console.log(text);
};

function report(label, result) {
  if (result.error) {
    say(`   ${label}: ULASILAMADI (${result.error})`);
    return false;
  }
  const redirected = result.finalUrl && result.finalUrl !== result.requestedUrl;
  say(
    `   ${label}: HTTP ${result.status} · ${classify(result)} · ${result.bytes} bayt · ${result.ms} ms` +
      (redirected ? `\n      yonlendirildi -> ${mask(result.finalUrl)}` : ''),
  );
  if (!result.ok || classify(result).includes('degil')) {
    say(`      ilk satirlar: ${result.text.slice(0, 160).replace(/\s+/g, ' ')}`);
  }
  return result.ok;
}

async function probe(url, userAgent, label) {
  const result = await request(withProxy(url), userAgent);
  result.requestedUrl = url;
  return { ok: report(label, result), result };
}

/** Oynatma listesindeki ilk adresi bulur. */
function firstUri(body, base) {
  const line = body
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item && !item.startsWith('#'));
  if (!line) return undefined;
  try {
    return new URL(line, base).href;
  } catch {
    return undefined;
  }
}

/** Xtream hesabindan ilk canli kanalin adresini bulur. */
async function resolveXtream(host, username, password) {
  let base = host.trim();
  if (!/^https?:\/\//i.test(base)) base = `http://${base}`;
  base = base.replace(/\/+$/, '');

  say('1) Xtream hesabi dogrulaniyor');
  const auth = await request(
    `${base}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
    customUA ?? PLAYER_UA,
  );
  if (auth.error) {
    say(`   ULASILAMADI (${auth.error})`);
    return undefined;
  }
  let info;
  try {
    info = JSON.parse(auth.text).user_info;
  } catch {
    say(`   Sunucu JSON dondurmedi: ${auth.text.slice(0, 160)}`);
    return undefined;
  }
  if (!info || String(info.auth) === '0') {
    say(`   Giris reddedildi (durum: ${info?.status ?? 'bilinmiyor'})`);
    return undefined;
  }
  say(
    `   Hesap: ${info.username} · durum ${info.status} · baglanti ${info.active_cons ?? '?'}/${info.max_connections ?? '?'}` +
      (info.exp_date ? ` · bitis ${new Date(Number(info.exp_date) * 1000).toLocaleDateString('tr-TR')}` : ''),
  );
  const formats = Array.isArray(info.allowed_output_formats) ? info.allowed_output_formats.join(', ') : '?';
  say(`   Izin verilen bicimler: ${formats}`);
  if (!String(formats).includes('m3u8')) {
    say('   NOT: Hesap m3u8 sunmuyor gorunuyor; tarayicida .ts akisi denenmelidir.');
  }

  say('');
  say('2) Ilk canli kanal aliniyor');
  const streams = await request(
    `${base}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_live_streams`,
    customUA ?? PLAYER_UA,
  );
  if (streams.error) {
    say(`   ULASILAMADI (${streams.error})`);
    return undefined;
  }
  let list;
  try {
    list = JSON.parse(streams.text);
  } catch {
    // Liste 2 KB'den uzun olabilir; tam govdeyi yeniden cek.
    const full = await request(
      `${base}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_live_streams`,
      customUA ?? PLAYER_UA,
    );
    try {
      list = JSON.parse(full.text);
    } catch {
      say('   Kanal listesi cozulemedi.');
      return undefined;
    }
  }
  const first = Array.isArray(list) ? list[0] : undefined;
  if (!first) {
    say('   Hesapta canli kanal bulunamadi.');
    return undefined;
  }
  say(`   Kanal: ${first.name} (id ${first.stream_id})`);
  return `${base}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${first.stream_id}.m3u8`;
}

async function main() {
  say('AppleIpTv yayin tanilama (terminal)');
  say(`Tarih: ${new Date().toLocaleString('tr-TR')}`);
  say(`Node: ${process.version}${proxyBase ? ' · proxy uzerinden' : ' · dogrudan'}`);
  say('');

  let url = args.find((item) => /^https?:\/\//i.test(item));

  if (args[0] === '--xtream') {
    const [, host, username, password] = args;
    if (!host || !username || !password) {
      say('Kullanim: node scripts/tani.mjs --xtream http://sunucu:8080 kullanici sifre');
      process.exit(1);
    }
    url = await resolveXtream(host, username, password);
    if (!url) {
      say('');
      say('SONUC: Hesap dogrulanamadi. Adres, kullanici adi ve sifreyi kontrol edin.');
      process.exit(1);
    }
    say('');
  }

  if (!url) {
    say('Kullanim:');
    say('  node scripts/tani.mjs "http://sunucu:8080/live/kul/sifre/123.m3u8"');
    say('  node scripts/tani.mjs --xtream http://sunucu:8080 kullanici sifre');
    process.exit(1);
  }

  say(`3) Yayin adresi: ${mask(url)}`);
  say('');
  say('4) User-Agent karsilastirmasi (saglayici tarayiciyi engelliyor mu?)');
  const browser = await probe(url, BROWSER_UA, 'tarayici kimligi');
  const player = await probe(url, customUA ?? PLAYER_UA, `oynatici kimligi (${customUA ?? PLAYER_UA})`);

  let working = player.ok ? player : browser.ok ? browser : undefined;

  // Saglayicilar ayni kanali kimi zaman yalnizca HLS, kimi zaman yalnizca
  // MPEG-TS olarak sunar. Ilk bicim acilmadiysa digerini de deniyoruz.
  if (!working) {
    const alternate = /\.m3u8($|\?)/i.test(url)
      ? url.replace(/\.m3u8($|\?)/i, '.ts$1')
      : /\.ts($|\?)/i.test(url)
        ? url.replace(/\.ts($|\?)/i, '.m3u8$1')
        : undefined;
    if (alternate) {
      say('');
      say(`   Alternatif bicim deneniyor: ${mask(alternate)}`);
      const fallback = await probe(alternate, customUA ?? PLAYER_UA, 'alternatif bicim');
      if (fallback.ok) {
        working = fallback;
        url = alternate;
      }
    }
  }
  say('');

  if (!working) {
    say('5) Yayin parcasi: atlandi (adres acilmadi)');
    say('');
    say('SONUC: Saglayici yayini vermiyor. Olasi nedenler:');
    say('  - Kullanici adi/sifre veya abonelik suresi');
    say('  - Es zamanli baglanti siniri (baska bir cihazda acik olabilir)');
    say('  - Kanalin yayinda olmamasi veya bolge kisiti');
    say('  - Her iki bicim (.m3u8 ve .ts) de denendi, ikisi de acilmadi.');
    say('');
    say('  Ayni adresi VLC ile acmayi deneyin (Dosya > Ag Akisini Ac). VLC de');
    say('  acamiyorsa sorun kesinlikle saglayici tarafindadir.');
    process.exit(2);
  }

  const format = classify(working.result);
  if (format === 'HLS oynatma listesi') {
    say('5) Oynatma listesi takip ediliyor');
    let body = working.result.text;
    let base = working.result.finalUrl || url;
    let level = 0;
    while (level < 2) {
      const next = firstUri(body, base);
      if (!next) {
        say('   Liste bos - saglayici su an bu kanalda yayin vermiyor.');
        break;
      }
      const step = await probe(next, customUA ?? PLAYER_UA, `seviye ${level + 1}`);
      if (!step.ok) break;
      if (classify(step.result) === 'HLS oynatma listesi') {
        body = step.result.text;
        base = step.result.finalUrl || next;
        level += 1;
        continue;
      }
      say(`   Gercek yayin parcasi indi (${step.result.bytes} bayt).`);
      break;
    }
  } else {
    say(`5) Dogrudan akis (${format}) - oynatma listesi yok, parca kontrolu gerekmiyor.`);
  }

  say('');
  say('SONUC:');
  if (player.ok && !browser.ok) {
    say('  Saglayici tarayici User-Agent\'ini reddediyor, oynatici kimligini kabul ediyor.');
    say('  Bu durumda web surumu MUTLAKA proxy uzerinden calismalidir:');
    say('    npm run proxy');
    say('    Ayarlar > Gelismis > CORS proxy adresi: http://localhost:8787/proxy?url=');
  } else if (working.ok) {
    say('  Yayin saglayicidan sorunsuz iniyor.');
    say('  Tarayicida acilmiyorsa sorun CORS/proxy tarafindadir:');
    say('    npm run proxy');
    say('    Ayarlar > Gelismis > CORS proxy adresi: http://localhost:8787/proxy?url=');
    say('  Apple TV uygulamasinda proxy gerekmez.');
  }
  say('');
  say('Bu ciktiyi kopyalayip paylasabilirsiniz (sifre maskelenmistir).');
}

await main();
