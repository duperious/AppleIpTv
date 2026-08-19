#!/usr/bin/env node
/**
 * AppleIpTv CORS proxy'si.
 *
 * Tarayici, IPTV saglayicilarinin sunucularina dogrudan istek attiginda
 * genellikle CORS engeline takilir. Bu kucuk sunucu istegi sizin adiniza
 * yapar ve yanita CORS basliklarini ekler.
 *
 * Kullanim:
 *   node apps/proxy/src/server.js            # http://localhost:8787
 *   PORT=9000 node apps/proxy/src/server.js
 *
 * Web arayuzunde Ayarlar > Gelismis > proxy adresi alanina
 * "http://localhost:8787/proxy?url=" yazin.
 *
 * GUVENLIK: Bu sunucu acik bir yonlendiricidir. Yalnizca kendi
 * makinenizde/yerel aginizda calistirin, internete acmayin.
 */

import http from 'node:http';
import { Readable } from 'node:stream';

const PORT = Number(process.env['PORT'] ?? 8787);
const HOST = process.env['HOST'] ?? '127.0.0.1';
/**
 * Cogu IPTV saglayicisi tarayici User-Agent'ini reddeder (403) ve yalnizca
 * oynatici istemcilerine yanit verir. Istemci kendi degerini
 * X-Forward-User-Agent basligiyla gonderebilir.
 */
const UPSTREAM_USER_AGENT = process.env['UPSTREAM_USER_AGENT'] ?? 'VLC/3.0.20 LibVLC/3.0.20';

/** Bos birakilirsa tum hedeflere izin verilir; virgulle ayrilmis alan adi listesi verilebilir. */
const ALLOWED_HOSTS = (process.env['ALLOWED_HOSTS'] ?? '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
]);

/** Tarayicinin yaniti okuyabilmesi icin gereken basliklar. */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Content-Type,Accept-Ranges',
};

function setCors(res) {
  if (res.headersSent) return;
  for (const [key, value] of Object.entries(CORS_HEADERS)) res.setHeader(key, value);
}

/** Basliklar gonderildikten sonra yazmaya calisip sunucuyu dusurmemek icin. */
function fail(res, status, message) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.writeHead(status, { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}

function isAllowed(target) {
  if (ALLOWED_HOSTS.length === 0) return true;
  const hostname = target.hostname.toLowerCase();
  return ALLOWED_HOSTS.some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`));
}


/** Yanit bir HLS oynatma listesi mi? */
function isPlaylist(upstream, target) {
  const type = (upstream.headers.get('content-type') ?? '').toLowerCase();
  if (type.includes('mpegurl') || type.includes('x-mpegurl')) return true;
  const path = (upstream.url || target.href).split('?')[0].toLowerCase();
  return path.endsWith('.m3u8') || path.endsWith('.m3u');
}

/** Istemcinin gordugu proxy adresi ("http://host:port/proxy?url="). */
function publicProxyBase(req) {
  const host = req.headers.host ?? `${HOST}:${PORT}`;
  return `http://${host}/proxy?url=`;
}

/**
 * HLS oynatma listesindeki tum adresleri mutlaklastirip proxy'ye sarar.
 * Yorum satirlarindaki URI="..." alanlari (anahtar, altyazi, ses parcalari)
 * da kapsanir.
 */
function rewritePlaylist(body, finalUrl, proxyBase) {
  const wrap = (value) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.startsWith('#')) return value;
    if (trimmed.startsWith(proxyBase)) return trimmed;
    let absolute;
    try {
      absolute = new URL(trimmed, finalUrl).href;
    } catch {
      return value;
    }
    return `${proxyBase}${encodeURIComponent(absolute)}`;
  };

  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        // #EXT-X-KEY:URI="...", #EXT-X-MEDIA:URI="..." gibi alanlar
        return line.replace(/URI="([^"]+)"/g, (_match, uri) => `URI="${wrap(uri)}"`);
      }
      return wrap(trimmed);
    })
    .join('\n');
}

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (requestUrl.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (requestUrl.pathname !== '/proxy') {
    fail(res, 404, 'Kullanim: /proxy?url=<hedef-adres>');
    return;
  }

  const raw = requestUrl.searchParams.get('url');
  if (!raw) {
    fail(res, 400, 'url parametresi gerekli');
    return;
  }

  let target;
  try {
    target = new URL(raw);
  } catch {
    fail(res, 400, 'Gecersiz adres');
    return;
  }

  if (!/^https?:$/.test(target.protocol)) {
    fail(res, 400, 'Yalnizca http/https desteklenir');
    return;
  }

  if (!isAllowed(target)) {
    fail(res, 403, 'Bu alan adi ALLOWED_HOSTS listesinde degil');
    return;
  }

  // Bazi saglayicilar belirli bir User-Agent bekler; istemci
  // X-Forward-User-Agent basligiyla bunu iletebilir.
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower) || lower.startsWith('sec-') || lower === 'origin' || lower === 'referer') continue;
    if (lower === 'x-forward-user-agent') continue;
    if (typeof value === 'string') headers[key] = value;
  }
  const forwardedAgent = req.headers['x-forward-user-agent'];
  headers['user-agent'] = typeof forwardedAgent === 'string' && forwardedAgent
    ? forwardedAgent
    : UPSTREAM_USER_AGENT;

  const controller = new AbortController();
  req.on('close', () => controller.abort());

  try {
    const upstream = await fetch(target, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers,
      redirect: 'follow',
      signal: controller.signal,
    });

    const outHeaders = { ...CORS_HEADERS };
    upstream.headers.forEach((value, key) => {
      if (!HOP_BY_HOP.has(key.toLowerCase()) && !key.toLowerCase().startsWith('access-control-')) {
        outHeaders[key] = value;
      }
    });
    // Yonlendirme sonrasi gercek adres; istemci tarafi tanilamada gosterilir.
    outHeaders['X-Final-Url'] = upstream.url || target.href;
    outHeaders['X-AppleIpTv-Proxy'] = '1';

    if (!upstream.body || req.method === 'HEAD') {
      res.writeHead(upstream.status, outHeaders);
      res.end();
      return;
    }

    // Oynatma listeleri metin olarak yeniden yazilir: icindeki goreli
    // adresler yonlendirme sonrasi gercek adrese gore mutlaklastirilir ve
    // proxy'ye sarilir. Boylece hem 302 yonlendirmeleri hem de goreli
    // parca adresleri dogru cozulur.
    if (isPlaylist(upstream, target)) {
      const body = await upstream.text();
      const rewritten = rewritePlaylist(body, upstream.url || target.href, publicProxyBase(req));
      delete outHeaders['content-length'];
      delete outHeaders['Content-Length'];
      delete outHeaders['content-encoding'];
      res.writeHead(upstream.status, outHeaders);
      res.end(rewritten);
      return;
    }

    res.writeHead(upstream.status, outHeaders);
    const stream = Readable.fromWeb(upstream.body);
    // Yayin ortasinda kopan baglantilar sureci dusurmemeli.
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  } catch (error) {
    if (controller.signal.aborted) {
      res.destroy();
      return;
    }
    fail(res, 502, `Hedefe ulasilamadi: ${error instanceof Error ? error.message : String(error)}`);
  }
});

server.on('clientError', (_error, socket) => socket.destroy());
// Tek bir bozuk istek yuzunden proxy'nin kapanmasi, kullanicinin tum
// yayinlarinin durmasi anlamina gelir; bu yuzden surec ayakta tutuluyor.
process.on('uncaughtException', (error) => {
  console.error('Beklenmeyen hata (surec devam ediyor):', error?.message ?? error);
});

server.listen(PORT, HOST, () => {
  console.log(`AppleIpTv proxy calisiyor: http://${HOST}:${PORT}/proxy?url=`);
  console.log(`Hedefe gonderilen User-Agent: ${UPSTREAM_USER_AGENT}`);
  if (ALLOWED_HOSTS.length > 0) console.log(`Izinli alan adlari: ${ALLOWED_HOSTS.join(', ')}`);
  else console.log('Uyari: ALLOWED_HOSTS bos, tum hedeflere izin veriliyor. Sunucuyu internete acmayin.');
});
