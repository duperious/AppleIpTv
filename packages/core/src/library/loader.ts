import { buildCatalogFromM3U } from '../parsers/m3u.js';
import { buildNameToIdMap, indexPrograms, parseXmltv } from '../parsers/xmltv.js';
import type { EpgIndex, XmltvChannel } from '../parsers/xmltv.js';
import type { Catalog, EpgProgram, LiveChannel, Playlist } from '../types.js';
import { XtreamClient } from '../xtream/client.js';
import { channelMatchKey, httpGet, httpGetText, normalizeText } from '../utils.js';
import type { FetchOptions } from '../utils.js';

export interface LoadResult {
  catalog: Catalog;
  /** Kaynagin bildirdigi EPG adresi (varsa). */
  epgUrl?: string;
  /** Xtream hesabinin bitis tarihi (ms). */
  expiresAt?: number;
}

export interface LoadOptions extends FetchOptions {
  onProgress?: (stage: string, done: number, total: number) => void;
}

/** Playlist turune gore ilgili yukleyiciyi calistirir. */
export async function loadPlaylist(playlist: Playlist, options: LoadOptions = {}): Promise<LoadResult> {
  const { source } = playlist;
  if (source.kind === 'xtream') {
    const client = new XtreamClient(source, options);
    options.onProgress?.('Hesap dogrulaniyor', 0, 1);
    const account = await client.authenticate(options.signal);
    const catalog = await client.fetchCatalog(playlist.id, {
      signal: options.signal,
      onProgress: options.onProgress,
    });
    return {
      catalog,
      epgUrl: source.epgUrl || client.epgUrl(),
      expiresAt: account.user.expDate ? account.user.expDate * 1000 : undefined,
    };
  }

  options.onProgress?.('Playlist indiriliyor', 0, 1);
  const text = source.inlineContent ?? (await httpGetText(source.url ?? '', { ...options, userAgent: source.userAgent }));
  if (!/#EXTM3U|#EXTINF/i.test(text.slice(0, 4096))) {
    throw new Error('Bu adres gecerli bir M3U playlist gibi gorunmuyor.');
  }
  options.onProgress?.('Playlist ayristiriliyor', 1, 2);
  const built = buildCatalogFromM3U(playlist.id, text);
  const { epgUrl, ...catalog } = built;
  options.onProgress?.('Tamamlandi', 2, 2);
  return { catalog, epgUrl: source.epgUrl || epgUrl };
}

/** gzip ile sikistirilmis EPG dosyalarini da destekleyen indirici. */
export async function fetchEpgText(url: string, options: FetchOptions = {}): Promise<string> {
  const response = await httpGet(url, { timeoutMs: 120_000, ...options });
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const isGzip = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!isGzip) return new TextDecoder('utf-8').decode(bytes);

  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Sikistirilmis EPG dosyasi bu ortamda acilamiyor (DecompressionStream yok).');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

export interface EpgBundle {
  index: EpgIndex;
  channels: XmltvChannel[];
  programs: EpgProgram[];
  /** Kanal kimligi -> XMLTV kimligi eslesmesi (ad tabanli tahminler dahil). */
  channelIdMap: Map<string, string>;
  fetchedAt: number;
}

/**
 * EPG'yi indirir, ayristirir ve kataloktaki kanallarla eslestirir.
 * tvg-id bos olan kanallar icin ad benzerligiyle tahmin yapilir.
 */
export async function loadEpg(
  url: string,
  channels: readonly LiveChannel[],
  options: FetchOptions = {},
): Promise<EpgBundle> {
  const xml = await fetchEpgText(url, options);
  const parsed = parseXmltv(xml);
  const nameMap = buildNameToIdMap(parsed.channels);

  const channelIdMap = new Map<string, string>();
  const knownIds = new Set(parsed.channels.map((c) => c.id));
  for (const channel of channels) {
    if (channel.tvgId && knownIds.has(channel.tvgId)) {
      channelIdMap.set(channel.id, channel.tvgId);
      continue;
    }
    const exact = nameMap.get(normalizeText(channel.name));
    if (exact) {
      channelIdMap.set(channel.id, exact);
      continue;
    }
    const loose = nameMap.get(channelMatchKey(channel.name));
    if (loose) channelIdMap.set(channel.id, loose);
  }

  return {
    index: indexPrograms(parsed.programs),
    channels: parsed.channels,
    programs: parsed.programs,
    channelIdMap,
    fetchedAt: Date.now(),
  };
}
