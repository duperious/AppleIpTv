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

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length,Content-Range,Content-Type,Accept-Ranges');
}

function isAllowed(target) {
  if (ALLOWED_HOSTS.length === 0) return true;
  const hostname = target.hostname.toLowerCase();
  return ALLOWED_HOSTS.some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`));
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
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Kullanim: /proxy?url=<hedef-adres>');
    return;
  }

  const raw = requestUrl.searchParams.get('url');
  if (!raw) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('url parametresi gerekli');
    return;
  }

  let target;
  try {
    target = new URL(raw);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Gecersiz adres');
    return;
  }

  if (!/^https?:$/.test(target.protocol)) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Yalnizca http/https desteklenir');
    return;
  }

  if (!isAllowed(target)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bu alan adi ALLOWED_HOSTS listesinde degil');
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
  if (typeof forwardedAgent === 'string') headers['user-agent'] = forwardedAgent;

  const controller = new AbortController();
  req.on('close', () => controller.abort());

  try {
    const upstream = await fetch(target, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers,
      redirect: 'follow',
      signal: controller.signal,
    });

    const outHeaders = {};
    upstream.headers.forEach((value, key) => {
      if (!HOP_BY_HOP.has(key.toLowerCase()) && !key.toLowerCase().startsWith('access-control-')) {
        outHeaders[key] = value;
      }
    });

    res.writeHead(upstream.status, outHeaders);
    setCors(res);

    if (!upstream.body || req.method === 'HEAD') {
      res.end();
      return;
    }
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (error) {
    if (controller.signal.aborted) {
      res.destroy();
      return;
    }
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Hedefe ulasilamadi: ${error instanceof Error ? error.message : String(error)}`);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`AppleIpTv proxy calisiyor: http://${HOST}:${PORT}/proxy?url=`);
  if (ALLOWED_HOSTS.length > 0) console.log(`Izinli alan adlari: ${ALLOWED_HOSTS.join(', ')}`);
  else console.log('Uyari: ALLOWED_HOSTS bos, tum hedeflere izin veriliyor. Sunucuyu internete acmayin.');
});
