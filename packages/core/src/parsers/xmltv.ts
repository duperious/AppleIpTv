import type { EpgProgram } from '../types.js';
import { channelMatchKey, normalizeText } from '../utils.js';

export interface XmltvChannel {
  id: string;
  displayNames: string[];
  icon?: string;
}

export interface XmltvParseResult {
  channels: XmltvChannel[];
  programs: EpgProgram[];
}

export interface XmltvParseOptions {
  /**
   * Yalnizca bu kanal kimlikleri saklanir. Buyuk EPG dosyalarinda
   * bellek kullanimini onemli olcude dusurur.
   */
  keepChannelIds?: ReadonlySet<string>;
  /** Bu andan once biten yayinlari atla (ms). Varsayilan: 6 saat once. */
  minStop?: number;
  /** Bu andan sonra baslayan yayinlari atla (ms). Varsayilan: 7 gun sonra. */
  maxStart?: number;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodeXmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/**
 * XMLTV zaman damgasi: "20240131235900 +0300" (saat dilimi istege bagli).
 * Donus: Unix ms, cozulemezse NaN.
 */
export function parseXmltvTime(value: string): number {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/.exec(value.trim());
  if (!match) return Number.NaN;
  const [, y, mo, d, h, mi, s, tz] = match;
  const base = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? '0'));
  if (!tz) return base;
  const sign = tz.startsWith('-') ? 1 : -1;
  const offsetMins = Number(tz.slice(1, 3)) * 60 + Number(tz.slice(3, 5));
  return base + sign * offsetMins * 60_000;
}

function attr(tag: string, name: string): string | undefined {
  const re = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i');
  const match = re.exec(tag);
  return match ? decodeXmlEntities(match[1]!) : undefined;
}

function firstTagText(block: string, tagName: string): string | undefined {
  const re = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}>`, 'i');
  const match = re.exec(block);
  return match ? decodeXmlEntities(match[1]!.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).trim() : undefined;
}

function allTagTexts(block: string, tagName: string): string[] {
  const re = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}>`, 'gi');
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(block)) !== null) {
    out.push(decodeXmlEntities(match[1]!.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).trim());
  }
  return out;
}

/**
 * XMLTV metnini ayristirir. DOM'a bagimli degildir; hem tarayicida
 * hem Node ortaminda ayni sekilde calisir.
 */
export function parseXmltv(xml: string, options: XmltvParseOptions = {}): XmltvParseResult {
  const now = Date.now();
  const minStop = options.minStop ?? now - 6 * 3600_000;
  const maxStart = options.maxStart ?? now + 7 * 86_400_000;
  const keep = options.keepChannelIds;

  const channels: XmltvChannel[] = [];
  const channelRe = /<channel\b([^>]*)>([\s\S]*?)<\/channel>/gi;
  let match: RegExpExecArray | null;
  while ((match = channelRe.exec(xml)) !== null) {
    const id = attr(match[1]!, 'id');
    if (!id) continue;
    const body = match[2]!;
    channels.push({
      id,
      displayNames: allTagTexts(body, 'display-name'),
      icon: /<icon\b[^>]*>/i.exec(body) ? attr(/<icon\b[^>]*>/i.exec(body)![0], 'src') : undefined,
    });
  }

  const programs: EpgProgram[] = [];
  const programRe = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi;
  while ((match = programRe.exec(xml)) !== null) {
    const head = match[1]!;
    const channelId = attr(head, 'channel');
    if (!channelId) continue;
    if (keep && !keep.has(channelId)) continue;

    const start = parseXmltvTime(attr(head, 'start') ?? '');
    const stop = parseXmltvTime(attr(head, 'stop') ?? '');
    if (!Number.isFinite(start)) continue;
    const end = Number.isFinite(stop) ? stop : start + 3600_000;
    if (end < minStop || start > maxStart) continue;

    const body = match[2]!;
    programs.push({
      channelId,
      title: firstTagText(body, 'title') ?? 'Program',
      description: firstTagText(body, 'desc'),
      start,
      stop: end,
      category: firstTagText(body, 'category'),
      episodeNum: firstTagText(body, 'episode-num'),
      icon: /<icon\b[^>]*>/i.exec(body) ? attr(/<icon\b[^>]*>/i.exec(body)![0], 'src') : undefined,
    });
  }

  programs.sort((a, b) => a.start - b.start);
  return { channels, programs };
}

/** Kanal kimligine gore gruplanmis, zamana gore sirali program tablosu. */
export type EpgIndex = Map<string, EpgProgram[]>;

export function indexPrograms(programs: readonly EpgProgram[]): EpgIndex {
  const index: EpgIndex = new Map();
  for (const program of programs) {
    const list = index.get(program.channelId);
    if (list) list.push(program);
    else index.set(program.channelId, [program]);
  }
  for (const list of index.values()) list.sort((a, b) => a.start - b.start);
  return index;
}

export function programAt(index: EpgIndex, channelId: string, at: number): EpgProgram | undefined {
  const list = index.get(channelId);
  if (!list) return undefined;
  // Binary search: baslangici <= at olan son kayit.
  let low = 0;
  let high = list.length - 1;
  let found: EpgProgram | undefined;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const item = list[mid]!;
    if (item.start <= at) {
      found = item;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found && found.stop > at ? found : undefined;
}

export function upcoming(index: EpgIndex, channelId: string, at: number, count = 5): EpgProgram[] {
  const list = index.get(channelId) ?? [];
  return list.filter((p) => p.stop > at).slice(0, count);
}

/**
 * Kanal adlarindan XMLTV kimligine kaba eslesme tablosu uretir.
 * tvg-id bos gelen playlistlerde EPG'yi yine de baglayabilmek icin.
 */
export function buildNameToIdMap(channels: readonly XmltvChannel[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const channel of channels) {
    for (const name of channel.displayNames) {
      const exact = normalizeText(name);
      if (exact && !map.has(exact)) map.set(exact, channel.id);
      const loose = channelMatchKey(name);
      if (loose && !map.has(loose)) map.set(loose, channel.id);
    }
    const idKey = normalizeText(channel.id);
    if (idKey && !map.has(idKey)) map.set(idKey, channel.id);
  }
  return map;
}
