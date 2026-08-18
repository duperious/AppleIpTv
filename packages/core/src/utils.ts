/** Kucuk yardimcilar: metin normalizasyonu, kimlik uretimi, ag istekleri. */

const DIACRITICS = /[\u0300-\u036f]/g;

/**
 * Arama ve eslestirme icin metni sadelestirir:
 * kucuk harf, aksan/Turkce karakter sadelestirmesi, tek bosluk.
 */
export function normalizeText(input: string): string {
  return input
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** "TR| BeIN SPORTS 1 FHD" -> "bein sports 1" gibi kaba bir kanal anahtari. */
export function channelMatchKey(name: string): string {
  return normalizeText(name)
    .replace(/\b(fhd|uhd|hd|sd|4k|8k|hevc|h265|h264|raw|backup|vip|multi|tr|turk|turkiye)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Kaynak icinde kararli kimlik: playlist + tur + ham anahtar. */
export function makeId(playlistId: string, kind: string, raw: string | number): string {
  return `${playlistId}:${kind}:${raw}`;
}

export function randomId(prefix = ''): string {
  const bytes = new Uint8Array(9);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return prefix ? `${prefix}_${out}` : out;
}

/** PIN'i duz metin saklamamak icin SHA-256 (hex). */
export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`appleiptv:${pin}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface FetchOptions {
  /** Ag isteklerini CORS proxy uzerinden gecirmek icin: "https://proxy/?url=" gibi. */
  proxyUrl?: string;
  userAgent?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Proxy ayarliysa hedef adresi proxy'ye sarar. */
export function withProxy(url: string, proxyUrl?: string): string {
  if (!proxyUrl) return url;
  const base = proxyUrl.includes('{url}')
    ? proxyUrl.replace('{url}', encodeURIComponent(url))
    : `${proxyUrl}${proxyUrl.includes('?') ? '&' : '?'}url=${encodeURIComponent(url)}`;
  return base;
}

/** Zaman asimi + proxy destekli fetch. Hata durumunda anlamli mesaj firlatir. */
export async function httpGet(url: string, opts: FetchOptions = {}): Promise<Response> {
  const { timeoutMs = 30_000 } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onAbort);
  try {
    const headers: Record<string, string> = {};
    if (opts.userAgent) headers['X-Forward-User-Agent'] = opts.userAgent;
    const res = await fetch(withProxy(url, opts.proxyUrl), {
      signal: controller.signal,
      headers,
      redirect: 'follow',
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} - ${url.replace(/password=[^&]*/i, 'password=***')}`);
    }
    return res;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

export async function httpGetText(url: string, opts: FetchOptions = {}): Promise<string> {
  return (await httpGet(url, opts)).text();
}

export async function httpGetJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const text = await httpGetText(url, opts);
  try {
    return JSON.parse(text) as T;
  } catch {
    // Xtream sunuculari hata durumunda bazen HTML dondurur.
    throw new Error(`Sunucu gecerli JSON dondurmedi: ${text.slice(0, 120)}`);
  }
}

export function formatDuration(secs: number): string {
  if (!Number.isFinite(secs) || secs <= 0) return '';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h} sa ${m} dk` : `${m} dk`;
}

/** "01:23:45" veya "83" gibi degerleri saniyeye cevirir. */
export function parseDurationSecs(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parts = value.split(':').map((p) => Number(p));
  if (parts.some((p) => !Number.isFinite(p))) return undefined;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  return parts[0];
}

export function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value.replace(',', '.'));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Belirli es zamanlilikta sirali is calistirir (saglayiciyi bogmamak icin). */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}
