/**
 * Uctan uca testler icin sahte IPTV sunucusu.
 *
 * Gercek bir saglayici gibi davranir: M3U playlist, XMLTV rehberi,
 * Xtream Codes `player_api.php` uclari ve oynatilabilir bir video dosyasi.
 */
import http from 'node:http';
import { readFileSync } from 'node:fs';

const VIDEO = readFileSync(new URL('./fixtures-video.webm', import.meta.url));

const M3U = `#EXTM3U url-tvg="http://127.0.0.1:8899/xmltv"
#EXTINF:-1 tvg-id="trt1.tr" tvg-name="TRT 1" tvg-logo="http://127.0.0.1:8899/logo.png" group-title="Ulusal" tvg-chno="1",TRT 1 HD
http://127.0.0.1:8899/nocors/live/1.ts
#EXTINF:-1 tvg-id="beinsports1.tr" group-title="Spor",beIN SPORTS 1 FHD
http://127.0.0.1:8899/live/2.m3u8
#EXTINF:7200 group-title="Filmler",Inception (2010)
http://127.0.0.1:8899/movie/10.webm
#EXTINF:-1 group-title="Diziler",Dark S01 E01 - Sirlar
http://127.0.0.1:8899/series/20.mkv
#EXTINF:-1 group-title="Diziler",Dark S01 E02 - Yalanlar
http://127.0.0.1:8899/series/21.mkv
`;

const now = Date.now();
const stamp = (offsetMin) => {
  const d = new Date(now + offsetMin * 60000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00 +0000`;
};

const XMLTV = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="trt1.tr"><display-name>TRT 1</display-name></channel>
  <channel id="beinsports1.tr"><display-name>beIN Sports 1</display-name></channel>
  <programme start="${stamp(-30)}" stop="${stamp(30)}" channel="trt1.tr"><title>Ana Haber</title><desc>Gunun ozeti</desc></programme>
  <programme start="${stamp(30)}" stop="${stamp(90)}" channel="trt1.tr"><title>Belgesel</title></programme>
  <programme start="${stamp(-15)}" stop="${stamp(75)}" channel="beinsports1.tr"><title>Derbi</title></programme>
</tv>`;

/** Gelen istekleri testlerin inceleyebilmesi icin kaydeder. */
const requestLog = [];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:8899');
  requestLog.push(url.pathname);

  // "/nocors/..." uclari bilerek CORS basligi gondermez: cogu IPTV
  // saglayicisi boyle davranir ve tarayici XHR ile indirmeyi reddeder.
  if (!url.pathname.startsWith('/nocors/')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  if (url.pathname === '/__requests') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(requestLog));
    return;
  }
  if (url.pathname.endsWith('/live/1.m3u8')) {
    res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
    res.end(`#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:2.0,\nsegment0.ts\n#EXTINF:2.0,\nsegment1.ts\n`);
    return;
  }
  if (url.pathname.endsWith('.ts')) {
    // Cozulebilir bir aksis degil; testler ag katmanini dogruluyor.
    res.writeHead(200, { 'Content-Type': 'video/mp2t' });
    res.end(Buffer.alloc(4096, 0x47));
    return;
  }

  if (url.pathname === '/get.php') {
    res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl' });
    res.end(M3U);
  } else if (url.pathname === '/xmltv' || url.pathname === '/xmltv.php') {
    res.writeHead(200, { 'Content-Type': 'application/xml' });
    res.end(XMLTV);
  } else if (url.pathname === '/player_api.php') {
    const action = url.searchParams.get('action');
    const body = {
      null: { user_info: { username: 'test', auth: 1, status: 'Active', exp_date: '4102444800', max_connections: '2' }, server_info: { url: '127.0.0.1', port: '8899' } },
      get_live_categories: [{ category_id: '1', category_name: 'Ulusal' }],
      get_vod_categories: [{ category_id: '2', category_name: 'Filmler' }],
      get_series_categories: [{ category_id: '3', category_name: 'Diziler' }],
      get_live_streams: [{ stream_id: 1, name: 'TRT 1 HD', category_id: '1', num: 1, epg_channel_id: 'trt1.tr' }],
      get_vod_streams: [{ stream_id: 10, name: 'Inception', category_id: '2', container_extension: 'mp4', year: '2010', rating: '8.8' }],
      get_series: [{ series_id: 20, name: 'Dark', category_id: '3', releaseDate: '2017-12-01' }],
    }[action ?? 'null'] ?? [];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  } else if (url.pathname.startsWith('/movie/')) {
    res.writeHead(200, { 'Content-Type': 'video/webm', 'Content-Length': VIDEO.length, 'Accept-Ranges': 'bytes' });
    res.end(VIDEO);
  } else {
    res.writeHead(404);
    res.end('yok');
  }
});
server.listen(8899, '127.0.0.1', () => console.log('sahte IPTV sunucusu: http://127.0.0.1:8899'));
