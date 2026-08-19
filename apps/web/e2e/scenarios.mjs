/**
 * Uctan uca senaryolar. Her senaryo temiz bir tarayici baglaminda calisir
 * ve gercek bir kullanicinin izleyecegi yolu takip eder.
 */

const log = (...parts) => console.log('   •', ...parts);

/** Ilk acilista profil olusturur. */
async function createProfile(page, baseURL, name) {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.locator('input').first().fill(name);
  await page.getByRole('button', { name: 'Olustur' }).click();
  await page.waitForURL('**/settings/sources');
}

async function addM3USource(page, baseURL, url) {
  await page.getByRole('button', { name: 'M3U adresi' }).click();
  await page.locator('label:has-text("M3U adresi") input').fill(url);
  await page.getByRole('button', { name: 'Kaynagi ekle' }).click();
  await page.waitForURL(baseURL, { timeout: 30_000 });
}

/** IndexedDB'ye yazilmis bir kaydi okur. */
async function readStored(page, prefix) {
  return page.evaluate(async (keyPrefix) => {
    const request = indexedDB.open('appleiptv');
    const db = await new Promise((resolve) => { request.onsuccess = () => resolve(request.result); });
    const keys = await new Promise((resolve) => {
      const query = db.transaction('kv', 'readonly').objectStore('kv').getAllKeys();
      query.onsuccess = () => resolve(query.result);
    });
    const key = keys.map(String).find((item) => item.startsWith(keyPrefix));
    if (!key) return null;
    return new Promise((resolve) => {
      const query = db.transaction('kv', 'readonly').objectStore('kv').get(key);
      query.onsuccess = () => resolve(query.result);
    });
  }, prefix);
}

/** M3U kaynagi: ayristirma, EPG eslesmesi, dizi gruplama, favori kaliciligi. */
export async function m3uFlow(page, baseURL) {
  await createProfile(page, baseURL, 'M3U Test');
  await addM3USource(page, baseURL, 'http://127.0.0.1:8899/get.php?username=a&password=b');

  await page.getByRole('link', { name: 'Canli TV' }).click();
  await page.waitForSelector('.channel');
  const channels = await page.locator('.channel').allTextContents();
  log('kanallar:', channels.length);
  if (channels.length !== 3) throw new Error(`Beklenen 3 kanal, gelen ${channels.length}`);
  if (!channels.join(' ').includes('Ana Haber')) throw new Error('EPG bilgisi kanal listesinde gorunmuyor');

  await page.getByRole('link', { name: 'Rehber' }).click();
  await page.waitForSelector('.guide__program');
  const programs = await page.locator('.guide__program').allTextContents();
  log('rehber programlari:', programs.join(', '));
  if (!programs.some((title) => title.includes('Derbi'))) throw new Error('Rehberde program bulunamadi');

  await page.getByRole('link', { name: 'Diziler' }).click();
  await page.waitForSelector('.card');
  await page.locator('.card').first().click();
  await page.waitForSelector('.episodes li');
  const episodes = await page.locator('.episode__text strong').allTextContents();
  log('bolumler:', episodes.join(' | '));
  if (episodes.length !== 2) throw new Error(`Beklenen 2 bolum, gelen ${episodes.length}`);

  await page.locator('#global-search').fill('bein');
  await page.locator('#global-search').press('Enter');
  await page.waitForSelector('.card');
  const firstResult = await page.locator('.card__name').first().textContent();
  log('arama sonucu:', firstResult);
  if (!firstResult?.toLowerCase().includes('bein')) throw new Error('Arama sonucu beklenenden farkli');

  await page.getByRole('link', { name: 'Canli TV' }).click();
  await page.waitForSelector('.channel__fav');
  await page.locator('.channel__fav').first().click();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('link', { name: 'Favoriler' }).click();
  await page.waitForSelector('.card');
  log('favori (yenilemeden sonra):', await page.locator('.card__name').first().textContent());
}

/** Xtream girisi: kimlik dogrulama, katalog ve oynatma adresi uretimi. */
export async function xtreamFlow(page, baseURL) {
  await createProfile(page, baseURL, 'Xtream Test');

  await page.locator('label:has-text("Sunucu adresi") input').fill('127.0.0.1:8899');
  await page.locator('label:has-text("Kullanici adi") input').fill('test');
  await page.locator('label:has-text("Sifre") input').fill('gizli');
  await page.getByRole('button', { name: 'Kaynagi ekle' }).click();
  await page.waitForURL(baseURL, { timeout: 30_000 });

  await page.getByRole('link', { name: 'Ayarlar' }).click();
  await page.getByRole('link', { name: 'Kaynaklari yonet' }).click();
  await page.waitForSelector('.list__item');
  const summary = (await page.locator('.list__meta').first().textContent())?.replace(/\s+/g, ' ').trim();
  log('kaynak ozeti:', summary);
  if (!summary?.includes('Xtream Codes')) throw new Error('Kaynak Xtream olarak kaydedilmedi');
  if (!summary.includes('1 kanal')) throw new Error('Kanal sayisi beklenenden farkli');

  const catalog = await readStored(page, 'catalog:');
  const liveURL = catalog?.live?.[0]?.url ?? '';
  const movieURL = catalog?.movies?.[0]?.url ?? '';
  log('canli adres:', liveURL);
  log('film adresi:', movieURL);
  if (!liveURL.includes('/live/test/gizli/1.m3u8')) throw new Error(`Canli adres hatali: ${liveURL}`);
  if (!movieURL.includes('/movie/test/gizli/10.mp4')) throw new Error(`Film adresi hatali: ${movieURL}`);
}

/** Oynatma: gercek video, klavye kisayollari ve ilerleme kaydi. */
export async function playbackFlow(page, baseURL) {
  await createProfile(page, baseURL, 'Oynatma');
  await addM3USource(page, baseURL, 'http://127.0.0.1:8899/get.php');

  await page.getByRole('link', { name: 'Filmler' }).click();
  await page.waitForSelector('.card');
  await page.locator('.card').first().click();
  await page.waitForSelector('.detail__actions');
  await page.locator('.detail__actions button.btn--primary').click();

  await page.waitForSelector('.player__video');
  await page.waitForFunction(() => {
    const video = document.querySelector('video');
    return video && video.currentTime > 1.5 && !video.paused;
  }, { timeout: 20_000 });

  const state = await page.evaluate(() => {
    const video = document.querySelector('video');
    return { time: video.currentTime, duration: video.duration, width: video.videoWidth };
  });
  log('video:', `${state.width}px, ${state.time.toFixed(1)}/${state.duration.toFixed(1)} sn`);
  if (state.width === 0) throw new Error('Video karesi cozulemedi');

  await page.keyboard.press(' ');
  await page.waitForFunction(() => document.querySelector('video')?.paused === true, { timeout: 5000 });
  await page.keyboard.press('ArrowRight');
  const seeked = await page.evaluate(() => document.querySelector('video').currentTime);
  log('ileri sarma sonrasi:', seeked.toFixed(1), 'sn');
  if (seeked < state.time + 5) throw new Error('Ileri sarma calismadi');

  await page.keyboard.press('Escape');
  await page.waitForSelector('.player__video', { state: 'detached' });

  const progress = await readStored(page, 'progress:');
  log('kaydedilen ilerleme:', progress?.[0]?.positionSecs?.toFixed(1), 'sn');
  if (!progress?.length) throw new Error('Ilerleme kaydedilmedi');
  if (progress[0].positionSecs < 5) throw new Error('Cikista sarma konumu kaydedilmedi');
  if (!progress[0].completed) throw new Error('Sona gelen icerik bitmis isaretlenmedi');

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('link', { name: 'Filmler' }).click();
  await page.waitForSelector('.card');
  await page.locator('.card').first().click();
  await page.waitForSelector('.detail__actions');
  const actions = await page.locator('.detail__actions button, .detail__actions a').allTextContents();
  if (!actions.some((label) => label.includes('Bastan oynat'))) {
    throw new Error('Izleme kaydi yenilemeden sonra korunmadi');
  }
  log('izleme kaydi yenilemeden sonra korundu');
}

/**
 * Canli yayin: CORS gondermeyen bir saglayiciya karsi once tanilama
 * mesaji, sonra proxy ile gercek oynatma zinciri dogrulanir.
 */
export async function liveFlow(page, baseURL) {
  await createProfile(page, baseURL, 'Canli Test');
  await addM3USource(page, baseURL, 'http://127.0.0.1:8899/get.php');

  // 1) Proxy yokken: kullaniciya sebebi anlatan bir mesaj cikmali.
  await page.getByRole('link', { name: 'Canli TV' }).click();
  await page.waitForSelector('.channel');
  await page.locator('.channel').first().click();
  await page.locator('.live__detail button.btn--primary').click();
  await page.waitForSelector('.player__status-text--error', { timeout: 30_000 });
  const message = await page.locator('.player__status-text').textContent();
  log('proxy yokken:', message);
  if (!/CORS|proxy/i.test(message ?? '')) throw new Error(`CORS tanisi gosterilmedi: ${message}`);
  if (!(await page.getByRole('button', { name: 'Yeniden dene' }).isVisible())) {
    throw new Error('Yeniden dene butonu gorunmuyor');
  }
  await page.getByRole('button', { name: 'Geri don' }).click();

  // 2) Proxy tanimliyken: hem yayin listesi hem parcalar proxy'den inmeli.
  await page.getByRole('link', { name: 'Ayarlar' }).click();
  await page.locator('label:has-text("CORS proxy adresi") input').fill('http://127.0.0.1:8787/proxy?url=');
  await page.waitForTimeout(400);

  await page.getByRole('link', { name: 'Canli TV' }).click();
  await page.waitForSelector('.channel');
  await page.locator('.channel').first().click();
  await page.evaluate(() => performance.clearResourceTimings());
  await page.locator('.live__detail button.btn--primary').click();
  await page.waitForSelector('.player__video');

  await page.waitForFunction(
    () => performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/proxy?url=')).length >= 2,
    { timeout: 30_000 },
  );
  const proxied = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => name.includes('/proxy?url='))
      .map((name) => decodeURIComponent(new URL(name).searchParams.get('url') ?? '')),
  );
  log('proxy uzerinden inenler:', proxied.length, 'istek');
  if (!proxied.some((url) => url.endsWith('.m3u8'))) {
    throw new Error(`Yayin listesi proxy uzerinden inmedi: ${JSON.stringify(proxied)}`);
  }
  if (!proxied.some((url) => url.includes('segment'))) {
    throw new Error(`Yayin parcalari proxy uzerinden inmedi: ${JSON.stringify(proxied)}`);
  }
  // Kanal adresi .ts idi; parcalarin inmesi .m3u8 gecisinin calistigini gosterir.
  log('.ts -> .m3u8 gecisi ve parca indirme dogrulandi');
}

/**
 * Gercek dunyada sik karsilasilan zorlu saglayici: CORS basligi gondermez,
 * tarayici User-Agent'ini 403 ile reddeder, adresi baska bir yola
 * yonlendirir ve oynatma listeleri goreli adresler icerir.
 */
export async function hostileProviderFlow(page, baseURL) {
  await createProfile(page, baseURL, 'Zorlu');
  await addM3USource(page, baseURL, 'http://127.0.0.1:8899/get.php');

  await page.getByRole('link', { name: 'Ayarlar' }).click();
  await page.locator('label:has-text("CORS proxy adresi") input').fill('http://127.0.0.1:8787/proxy?url=');
  await page.waitForTimeout(400);

  // Tanilama tum adimlarda basarili olmali.
  await page.locator('label:has-text("Test edilecek kanal") select').selectOption({ label: 'Zorlu Saglayici HD' });
  await page.getByRole('button', { name: 'Yayini test et' }).click();
  await page.waitForSelector('.diagnostics__step', { timeout: 40_000 });
  await page.waitForFunction(
    () => document.querySelectorAll('.diagnostics__step').length >= 5,
    { timeout: 40_000 },
  );
  const failed = await page.locator('.diagnostics__step.is-fail').allTextContents();
  const results = await page.locator('.diagnostics__step strong').allTextContents();
  log('tanilama adimlari:', results.join(', '));
  if (failed.length > 0) throw new Error(`Tanilama basarisiz adim(lar): ${failed.join(' | ')}`);

  // Oynatma: yonlendirme + goreli adresler cozulup parcalar inmeli.
  await page.getByRole('link', { name: 'Canli TV' }).click();
  await page.waitForSelector('.channel');
  await page.getByRole('button', { name: /Zorlu Saglayici HD/ }).first().click();
  await page.evaluate(() => performance.clearResourceTimings());
  await page.locator('.live__detail button.btn--primary').click();
  await page.waitForSelector('.player__video');

  await page.waitForFunction(
    () =>
      performance
        .getEntriesByType('resource')
        .some((entry) => entry.name.includes('/proxy?url=') && decodeURIComponent(entry.name).includes('seg0.ts')),
    { timeout: 40_000 },
  );
  log('yonlendirme sonrasi parcalar indirildi');

  const status = await page.locator('.player__status-text').textContent().catch(() => null);
  if (status && /CORS|acilamadi|indirilemedi/i.test(status)) {
    throw new Error(`Oynatici hata gosteriyor: ${status}`);
  }
}

export const scenarios = [
  { name: 'M3U akisi', run: m3uFlow },
  { name: 'Xtream akisi', run: xtreamFlow },
  { name: 'Oynatma ve ilerleme', run: playbackFlow },
  { name: 'Canli yayin ve proxy', run: liveFlow },
  { name: 'Zorlu saglayici (yonlendirme + UA)', run: hostileProviderFlow },
];
