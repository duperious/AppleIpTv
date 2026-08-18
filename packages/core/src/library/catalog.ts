import type {
  Catalog,
  Category,
  LiveChannel,
  MediaItem,
  MediaKind,
  MovieItem,
  Playlist,
  SeriesItem,
} from '../types.js';
import { normalizeText } from '../utils.js';

/** Birden fazla playlistin kataloglarini tek gorunumde birlestirir. */
export function mergeCatalogs(catalogs: readonly Catalog[]): Catalog {
  return {
    playlistId: '*',
    live: catalogs.flatMap((c) => c.live),
    movies: catalogs.flatMap((c) => c.movies),
    series: catalogs.flatMap((c) => c.series),
    categories: catalogs.flatMap((c) => c.categories),
    fetchedAt: Math.max(0, ...catalogs.map((c) => c.fetchedAt)),
  };
}

export interface CatalogIndex {
  byId: Map<string, MediaItem>;
  categoriesById: Map<string, Category>;
  /** kategori kimligi -> icerik kimlikleri */
  itemsByCategory: Map<string, string[]>;
  liveByTvgId: Map<string, LiveChannel[]>;
}

export function buildIndex(catalog: Catalog): CatalogIndex {
  const byId = new Map<string, MediaItem>();
  const categoriesById = new Map<string, Category>();
  const itemsByCategory = new Map<string, string[]>();
  const liveByTvgId = new Map<string, LiveChannel[]>();

  for (const category of catalog.categories) categoriesById.set(category.id, category);

  const register = (item: MediaItem) => {
    byId.set(item.id, item);
    for (const categoryId of item.categoryIds) {
      const list = itemsByCategory.get(categoryId);
      if (list) list.push(item.id);
      else itemsByCategory.set(categoryId, [item.id]);
    }
  };

  for (const channel of catalog.live) {
    register(channel);
    if (channel.tvgId) {
      const list = liveByTvgId.get(channel.tvgId);
      if (list) list.push(channel);
      else liveByTvgId.set(channel.tvgId, [channel]);
    }
  }
  for (const movie of catalog.movies) register(movie);
  for (const series of catalog.series) register(series);

  return { byId, categoriesById, itemsByCategory, liveByTvgId };
}

export interface SearchOptions {
  kinds?: readonly MediaKind[];
  limit?: number;
  /** Gizlenmis kategoriler sonuclardan cikarilir. */
  hiddenCategoryIds?: ReadonlySet<string>;
}

interface Scored {
  item: MediaItem;
  score: number;
}

/**
 * Katalog genelinde arama. Tam eslesme > bas harf eslesmesi > kelime
 * eslesmesi seklinde puanlanir, boylece "bein" araması "beIN Sports 1"i
 * "Cine BeIN"den once getirir.
 */
export function searchCatalog(catalog: Catalog, query: string, options: SearchOptions = {}): MediaItem[] {
  const needle = normalizeText(query);
  if (!needle) return [];
  const kinds = new Set(options.kinds ?? (['live', 'movie', 'series'] as MediaKind[]));
  const limit = options.limit ?? 200;
  const hidden = options.hiddenCategoryIds;
  const terms = needle.split(' ').filter(Boolean);

  const pools: MediaItem[][] = [];
  if (kinds.has('live')) pools.push(catalog.live);
  if (kinds.has('movie')) pools.push(catalog.movies);
  if (kinds.has('series')) pools.push(catalog.series);

  const results: Scored[] = [];
  for (const pool of pools) {
    for (const item of pool) {
      if (hidden && item.categoryIds.some((id) => hidden.has(id))) continue;
      const key = item.searchKey;
      if (!terms.every((term) => key.includes(term))) continue;
      let score = 0;
      if (key === needle) score = 1000;
      else if (key.startsWith(needle)) score = 500;
      else if (key.includes(` ${needle}`)) score = 250;
      else score = 100;
      score -= Math.min(50, key.length / 4);
      results.push({ item, score });
    }
  }

  results.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, 'tr'));
  return results.slice(0, limit).map((r) => r.item);
}

/** Bir kategoriye ait icerikleri dogal sirada dondurur. */
export function itemsInCategory(catalog: Catalog, index: CatalogIndex, categoryId: string): MediaItem[] {
  const ids = index.itemsByCategory.get(categoryId) ?? [];
  const items = ids.map((id) => index.byId.get(id)).filter((item): item is MediaItem => Boolean(item));
  return items.sort((a, b) => a.order - b.order);
}

export function categoriesOfKind(
  catalog: Catalog,
  kind: MediaKind,
  options: { hiddenCategoryIds?: ReadonlySet<string> } = {},
): Category[] {
  const hidden = options.hiddenCategoryIds;
  return catalog.categories
    .filter((category) => category.kind === kind && !(hidden?.has(category.id) ?? false))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

/** Ayni kanalin farkli kalitelerini (FHD/HD/SD) tek satirda toplamak icin. */
export function groupDuplicateChannels(channels: readonly LiveChannel[]): Map<string, LiveChannel[]> {
  const groups = new Map<string, LiveChannel[]>();
  for (const channel of channels) {
    const key = channel.tvgId || channel.searchKey;
    const list = groups.get(key);
    if (list) list.push(channel);
    else groups.set(key, [channel]);
  }
  return groups;
}

/** Ana ekran icin "yeni eklenenler" seridi. */
export function recentlyAdded(catalog: Catalog, kind: 'movie' | 'series', limit = 30): (MovieItem | SeriesItem)[] {
  const pool: (MovieItem | SeriesItem)[] = kind === 'movie' ? [...catalog.movies] : [...catalog.series];
  return pool
    .sort((a, b) => {
      const at = 'lastModified' in a ? (a.lastModified ?? 0) : 0;
      const bt = 'lastModified' in b ? (b.lastModified ?? 0) : 0;
      if (at !== bt) return bt - at;
      return b.order - a.order;
    })
    .slice(0, limit);
}

/** Playlist adi cakismalarini engellemek icin benzersiz ad uretir. */
export function uniquePlaylistName(existing: readonly Playlist[], desired: string): string {
  const names = new Set(existing.map((p) => p.name.toLocaleLowerCase('tr')));
  if (!names.has(desired.toLocaleLowerCase('tr'))) return desired;
  let counter = 2;
  while (names.has(`${desired} ${counter}`.toLocaleLowerCase('tr'))) counter++;
  return `${desired} ${counter}`;
}
