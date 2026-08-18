import type { Catalog, Category, Episode, LiveChannel, MovieItem, SeriesItem } from '../types.js';
import { makeId, normalizeText, parseDurationSecs, toNumber } from '../utils.js';

/** #EXTINF satirindaki tvg-* / group-title gibi ozniteliklerin ham hali. */
export type M3UAttributes = Record<string, string>;

export interface M3UEntry {
  duration: number;
  title: string;
  url: string;
  attributes: M3UAttributes;
  /** #EXTVLCOPT / #KODIPROP ile gelen oynatici secenekleri. */
  options: Record<string, string>;
}

export interface M3UParseResult {
  entries: M3UEntry[];
  /** #EXTM3U satirindaki url-tvg / x-tvg-url degeri. */
  epgUrl?: string;
}

const ATTR_RE = /([\w-]+)="([^"]*)"/g;
/** "Dizi Adi S01 E05" / "Dizi Adi S01E05" / "Dizi Adi 1x05" kaliplari. */
const EPISODE_RE = /^(.*?)[\s._-]*[sS](\d{1,2})[\s._-]*[eE](\d{1,3})\b(.*)$/;
const EPISODE_ALT_RE = /^(.*?)[\s._-]+(\d{1,2})x(\d{1,3})\b(.*)$/;

function parseAttributes(line: string): M3UAttributes {
  const attrs: M3UAttributes = {};
  ATTR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_RE.exec(line)) !== null) {
    attrs[match[1]!.toLowerCase()] = match[2]!;
  }
  return attrs;
}

/**
 * M3U / M3U8 playlist metnini ayristirir.
 * Bicimsiz satirlar, BOM, CRLF ve saglayiciya ozel eklentiler tolere edilir.
 */
export function parseM3U(text: string): M3UParseResult {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const entries: M3UEntry[] = [];
  let epgUrl: string | undefined;

  let pending: { duration: number; title: string; attributes: M3UAttributes } | null = null;
  let options: Record<string, string> = {};
  let groupOverride: string | undefined;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#EXTM3U')) {
      const attrs = parseAttributes(line);
      epgUrl = attrs['url-tvg'] ?? attrs['x-tvg-url'] ?? attrs['tvg-url'];
      continue;
    }

    if (line.startsWith('#EXTINF')) {
      const commaIndex = line.indexOf(',');
      const head = commaIndex >= 0 ? line.slice(0, commaIndex) : line;
      const title = commaIndex >= 0 ? line.slice(commaIndex + 1).trim() : '';
      const durationMatch = /#EXTINF:\s*(-?[\d.]+)/.exec(head);
      pending = {
        duration: durationMatch ? Number(durationMatch[1]) : -1,
        title,
        attributes: parseAttributes(head),
      };
      options = {};
      groupOverride = undefined;
      continue;
    }

    if (line.startsWith('#EXTGRP:')) {
      groupOverride = line.slice('#EXTGRP:'.length).trim();
      continue;
    }

    if (line.startsWith('#EXTVLCOPT:') || line.startsWith('#KODIPROP:')) {
      const value = line.slice(line.indexOf(':') + 1);
      const eq = value.indexOf('=');
      if (eq > 0) options[value.slice(0, eq).trim().toLowerCase()] = value.slice(eq + 1).trim();
      continue;
    }

    if (line.startsWith('#')) continue;
    if (!pending) continue;

    const attributes = { ...pending.attributes };
    if (groupOverride && !attributes['group-title']) attributes['group-title'] = groupOverride;

    entries.push({
      duration: pending.duration,
      title: pending.title || attributes['tvg-name'] || 'Isimsiz',
      url: line,
      attributes,
      options,
    });
    pending = null;
    options = {};
    groupOverride = undefined;
  }

  return { entries, epgUrl };
}

function classify(entry: M3UEntry): 'live' | 'movie' | 'series' {
  let path = entry.url;
  try {
    path = new URL(entry.url).pathname;
  } catch {
    /* goreli veya bicimsiz adres: ham metni kullan */
  }
  const lower = path.toLowerCase();
  if (/\/series\//.test(lower)) return 'series';
  if (/\/(movie|movies|vod)\//.test(lower)) return 'movie';

  // Xtream disi kaynaklarda grup adi tek ipucu olabilir.
  const group = normalizeText(entry.attributes['group-title'] ?? '');
  if (/\b(dizi|series|seriler)\b/.test(group) && (EPISODE_RE.test(entry.title) || EPISODE_ALT_RE.test(entry.title))) {
    return 'series';
  }
  if (/\b(film|movie|movies|vod|sinema)\b/.test(group)) return 'movie';

  // Uzun sureli kayitlar canli olamaz.
  if (entry.duration > 0) return 'movie';
  return 'live';
}

interface EpisodeInfo {
  seriesName: string;
  season: number;
  episode: number;
  title: string;
}

/** "Show S01 E02 - Pilot" gibi basliklardan dizi/sezon/bolum cikarir. */
export function parseEpisodeTitle(title: string): EpisodeInfo | null {
  const match = EPISODE_RE.exec(title) ?? EPISODE_ALT_RE.exec(title);
  if (!match) return null;
  const seriesName = match[1]!.replace(/[\s._-]+$/, '').trim();
  if (!seriesName) return null;
  const rest = (match[4] ?? '').replace(/^[\s._:-]+/, '').trim();
  return {
    seriesName,
    season: Number(match[2]),
    episode: Number(match[3]),
    title: rest || `Bolum ${Number(match[3])}`,
  };
}

/** Adres sonuna eklenen "|User-Agent=..." bicimindeki basliklari ayirir. */
export function splitUrlHeaders(url: string): { url: string; headers: Record<string, string> } {
  const pipe = url.indexOf('|');
  if (pipe < 0) return { url, headers: {} };
  const headers: Record<string, string> = {};
  for (const pair of url.slice(pipe + 1).split('&')) {
    const eq = pair.indexOf('=');
    if (eq > 0) headers[pair.slice(0, eq).trim()] = decodeURIComponent(pair.slice(eq + 1).trim());
  }
  return { url: url.slice(0, pipe), headers };
}

function categoryKey(playlistId: string, kind: string, name: string): string {
  return makeId(playlistId, `cat-${kind}`, normalizeText(name) || 'diger');
}

/**
 * Ayristirilmis M3U girdilerini uygulamanin ic kataloguna donusturur.
 * Canli kanal, film ve dizi bolumleri ayri koleksiyonlara dagitilir;
 * dizi bolumleri ust dizi kaydi altinda sezonlara gruplanir.
 */
export function buildCatalogFromM3U(playlistId: string, text: string): Catalog & { epgUrl?: string } {
  const { entries, epgUrl } = parseM3U(text);
  const live: LiveChannel[] = [];
  const movies: MovieItem[] = [];
  const seriesMap = new Map<string, SeriesItem & { seasons: NonNullable<SeriesItem['seasons']> }>();
  const categories = new Map<string, Category>();

  const ensureCategory = (kind: 'live' | 'movie' | 'series', rawName: string): string => {
    const name = rawName.trim() || 'Diger';
    const id = categoryKey(playlistId, kind, name);
    if (!categories.has(id)) categories.set(id, { id, name, kind, playlistId });
    return id;
  };

  entries.forEach((entry, index) => {
    const { url } = splitUrlHeaders(entry.url);
    const attrs = entry.attributes;
    const groupName = attrs['group-title'] ?? 'Diger';
    const logo = attrs['tvg-logo'] || undefined;
    const kind = classify(entry);

    if (kind === 'live') {
      const categoryId = ensureCategory('live', groupName);
      live.push({
        id: makeId(playlistId, 'live', attrs['tvg-id'] || url),
        playlistId,
        kind: 'live',
        name: entry.title,
        searchKey: normalizeText(entry.title),
        logo,
        categoryIds: [categoryId],
        order: index,
        tvgId: attrs['tvg-id'] || undefined,
        tvgName: attrs['tvg-name'] || undefined,
        url,
        catchup: attrs['catchup'] || attrs['timeshift'] || undefined,
        catchupSource: attrs['catchup-source'] || undefined,
        catchupDays: toNumber(attrs['catchup-days'] ?? attrs['timeshift']),
        channelNumber: toNumber(attrs['tvg-chno'] ?? attrs['channel-number']),
        epgShift: toNumber(attrs['tvg-shift']),
      });
      return;
    }

    if (kind === 'movie') {
      const categoryId = ensureCategory('movie', groupName);
      const yearMatch = /\((\d{4})\)/.exec(entry.title);
      movies.push({
        id: makeId(playlistId, 'movie', url),
        playlistId,
        kind: 'movie',
        name: entry.title,
        searchKey: normalizeText(entry.title),
        logo,
        categoryIds: [categoryId],
        order: index,
        url,
        year: yearMatch ? Number(yearMatch[1]) : undefined,
        durationSecs: entry.duration > 0 ? entry.duration : parseDurationSecs(attrs['duration']),
        containerExtension: url.split('.').pop()?.toLowerCase(),
      });
      return;
    }

    const info = parseEpisodeTitle(entry.title);
    const seriesName = info?.seriesName ?? entry.title;
    const categoryId = ensureCategory('series', groupName);
    const seriesId = makeId(playlistId, 'series', normalizeText(seriesName));
    let series = seriesMap.get(seriesId);
    if (!series) {
      series = {
        id: seriesId,
        playlistId,
        kind: 'series',
        name: seriesName,
        searchKey: normalizeText(seriesName),
        logo,
        categoryIds: [categoryId],
        order: index,
        seasons: [],
      };
      seriesMap.set(seriesId, series);
    } else if (!series.categoryIds.includes(categoryId)) {
      series.categoryIds.push(categoryId);
    }

    const seasonNumber = info?.season ?? 1;
    let season = series.seasons.find((s) => s.seasonNumber === seasonNumber);
    if (!season) {
      season = { seasonNumber, name: `${seasonNumber}. Sezon`, episodes: [] };
      series.seasons.push(season);
    }
    season.episodes.push({
      id: makeId(playlistId, 'ep', url),
      seriesId,
      seasonNumber,
      episodeNumber: info?.episode ?? season.episodes.length + 1,
      title: info?.title ?? entry.title,
      url,
      still: logo,
      durationSecs: entry.duration > 0 ? entry.duration : undefined,
      containerExtension: url.split('.').pop()?.toLowerCase(),
    });
  });

  for (const series of seriesMap.values()) {
    series.seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);
    for (const season of series.seasons) season.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
  }

  return {
    playlistId,
    live,
    movies,
    series: [...seriesMap.values()],
    categories: [...categories.values()],
    fetchedAt: Date.now(),
    epgUrl,
  };
}

export type { Episode };
