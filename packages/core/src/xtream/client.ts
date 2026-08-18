import type {
  Catalog,
  Category,
  Episode,
  LiveChannel,
  MovieItem,
  Season,
  SeriesItem,
  XtreamSource,
} from '../types.js';
import { httpGetJson, makeId, mapLimit, normalizeText, parseDurationSecs, toNumber } from '../utils.js';
import type { FetchOptions } from '../utils.js';

export interface XtreamUserInfo {
  username: string;
  status: string;
  /** Unix saniye. */
  expDate?: number;
  isTrial: boolean;
  activeConnections: number;
  maxConnections: number;
  allowedOutputFormats: string[];
  createdAt?: number;
}

export interface XtreamServerInfo {
  url: string;
  port?: string;
  httpsPort?: string;
  serverProtocol?: string;
  timezone?: string;
  timeNow?: string;
}

export interface XtreamAccount {
  user: XtreamUserInfo;
  server: XtreamServerInfo;
}

interface RawAuth {
  user_info?: Record<string, unknown>;
  server_info?: Record<string, unknown>;
}

interface RawCategory {
  category_id?: string | number;
  category_name?: string;
}

interface RawLive {
  stream_id?: number | string;
  name?: string;
  stream_icon?: string;
  epg_channel_id?: string | null;
  category_id?: string | number;
  category_ids?: (string | number)[];
  num?: number | string;
  tv_archive?: number | string;
  tv_archive_duration?: number | string;
  added?: string;
}

interface RawVod {
  stream_id?: number | string;
  name?: string;
  stream_icon?: string;
  cover?: string;
  rating?: string | number;
  category_id?: string | number;
  category_ids?: (string | number)[];
  container_extension?: string;
  year?: string | number;
  releasedate?: string;
  num?: number | string;
}

interface RawSeries {
  series_id?: number | string;
  name?: string;
  cover?: string;
  plot?: string;
  cast?: string;
  director?: string;
  genre?: string;
  releaseDate?: string;
  release_date?: string;
  last_modified?: string | number;
  rating?: string | number;
  backdrop_path?: string[] | string;
  category_id?: string | number;
  category_ids?: (string | number)[];
  num?: number | string;
}

const trimSlash = (value: string) => value.replace(/\/+$/, '');

/** Kullanicinin girdigi adresi normalize eder ("ornek.com:8080" -> "http://ornek.com:8080"). */
export function normalizeHost(host: string): string {
  const trimmed = host.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return trimSlash(withScheme);
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Xtream Codes uyumlu paneller icin istemci.
 * Tum istekler `player_api.php` uzerinden yapilir; oynatma adresleri
 * panelin standart yol semasina gore uretilir.
 */
export class XtreamClient {
  readonly host: string;
  private readonly username: string;
  private readonly password: string;
  private readonly fetchOptions: FetchOptions;
  private readonly preferHls: boolean;

  constructor(source: XtreamSource, fetchOptions: FetchOptions = {}) {
    this.host = normalizeHost(source.host);
    this.username = source.username;
    this.password = source.password;
    this.preferHls = source.preferHls ?? false;
    this.fetchOptions = { ...fetchOptions, userAgent: source.userAgent ?? fetchOptions.userAgent };
  }

  private apiUrl(params: Record<string, string | number | undefined> = {}): string {
    const search = new URLSearchParams({ username: this.username, password: this.password });
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) search.set(key, String(value));
    }
    return `${this.host}/player_api.php?${search.toString()}`;
  }

  /** Panelin XMLTV EPG adresi. */
  epgUrl(): string {
    const search = new URLSearchParams({ username: this.username, password: this.password });
    return `${this.host}/xmltv.php?${search.toString()}`;
  }

  liveUrl(streamId: number, extension?: string): string {
    const ext = extension ?? (this.preferHls ? 'm3u8' : 'ts');
    return `${this.host}/live/${encodeURIComponent(this.username)}/${encodeURIComponent(this.password)}/${streamId}.${ext}`;
  }

  movieUrl(streamId: number, extension = 'mp4'): string {
    return `${this.host}/movie/${encodeURIComponent(this.username)}/${encodeURIComponent(this.password)}/${streamId}.${extension}`;
  }

  episodeUrl(episodeId: string | number, extension = 'mp4'): string {
    return `${this.host}/series/${encodeURIComponent(this.username)}/${encodeURIComponent(this.password)}/${episodeId}.${extension}`;
  }

  /**
   * Gecmise donuk (catchup / timeshift) yayin adresi.
   * @param start yayinin baslangic zamani
   * @param durationMinutes kaydin suresi
   */
  timeshiftUrl(streamId: number, start: Date, durationMinutes: number): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}:${pad(start.getHours())}-${pad(start.getMinutes())}`;
    const search = new URLSearchParams({
      username: this.username,
      password: this.password,
      stream: String(streamId),
      start: stamp,
      duration: String(Math.max(1, Math.round(durationMinutes))),
    });
    return `${this.host}/streaming/timeshift.php?${search.toString()}`;
  }

  /** Hesabi dogrular; kimlik bilgileri hataliysa aciklayici hata firlatir. */
  async authenticate(signal?: AbortSignal): Promise<XtreamAccount> {
    const raw = await httpGetJson<RawAuth>(this.apiUrl(), { ...this.fetchOptions, signal });
    const user = raw.user_info ?? {};
    const status = String(user['status'] ?? '');
    if (String(user['auth'] ?? '1') === '0' || /banned|disabled|expired/i.test(status)) {
      throw new Error(`Xtream girisi reddedildi (durum: ${status || 'bilinmiyor'}).`);
    }
    if (!user['username']) {
      throw new Error('Xtream sunucusu kullanici bilgisi dondurmedi. Adres, kullanici adi ve sifreyi kontrol edin.');
    }
    const server = raw.server_info ?? {};
    const allowed = user['allowed_output_formats'];
    return {
      user: {
        username: String(user['username']),
        status: status || 'Active',
        expDate: toNumber(user['exp_date']),
        isTrial: String(user['is_trial'] ?? '0') === '1',
        activeConnections: toNumber(user['active_cons']) ?? 0,
        maxConnections: toNumber(user['max_connections']) ?? 0,
        allowedOutputFormats: Array.isArray(allowed) ? allowed.map(String) : ['ts', 'm3u8'],
        createdAt: toNumber(user['created_at']),
      },
      server: {
        url: String(server['url'] ?? this.host),
        port: server['port'] ? String(server['port']) : undefined,
        httpsPort: server['https_port'] ? String(server['https_port']) : undefined,
        serverProtocol: server['server_protocol'] ? String(server['server_protocol']) : undefined,
        timezone: server['timezone'] ? String(server['timezone']) : undefined,
        timeNow: server['time_now'] ? String(server['time_now']) : undefined,
      },
    };
  }

  private async categories(action: string, kind: Category['kind'], playlistId: string, signal?: AbortSignal): Promise<Category[]> {
    const raw = await httpGetJson<RawCategory[]>(this.apiUrl({ action }), { ...this.fetchOptions, signal });
    return asArray<RawCategory>(raw).map((item) => ({
      id: makeId(playlistId, `cat-${kind}`, String(item.category_id ?? '0')),
      name: String(item.category_name ?? 'Diger').trim() || 'Diger',
      kind,
      playlistId,
    }));
  }

  /**
   * Canli, film ve dizi listelerini tek seferde ceker.
   * @param onProgress asama basina ilerleme bildirimi (arayuzde gostermek icin)
   */
  async fetchCatalog(
    playlistId: string,
    options: { signal?: AbortSignal; onProgress?: (stage: string, done: number, total: number) => void } = {},
  ): Promise<Catalog> {
    const { signal, onProgress } = options;
    const report = (stage: string, done: number, total: number) => onProgress?.(stage, done, total);

    report('Kategoriler', 0, 6);
    const [liveCats, vodCats, seriesCats] = await Promise.all([
      this.categories('get_live_categories', 'live', playlistId, signal),
      this.categories('get_vod_categories', 'movie', playlistId, signal),
      this.categories('get_series_categories', 'series', playlistId, signal),
    ]);
    report('Kategoriler', 3, 6);

    const [rawLive, rawVod, rawSeries] = await Promise.all([
      httpGetJson<RawLive[]>(this.apiUrl({ action: 'get_live_streams' }), { ...this.fetchOptions, signal }),
      httpGetJson<RawVod[]>(this.apiUrl({ action: 'get_vod_streams' }), { ...this.fetchOptions, signal }),
      httpGetJson<RawSeries[]>(this.apiUrl({ action: 'get_series' }), { ...this.fetchOptions, signal }),
    ]);
    report('Icerikler', 6, 6);

    const catIds = (item: { category_id?: string | number; category_ids?: (string | number)[] }, kind: Category['kind']): string[] => {
      const ids = item.category_ids?.length ? item.category_ids : [item.category_id ?? '0'];
      return ids.map((id) => makeId(playlistId, `cat-${kind}`, String(id)));
    };

    const live: LiveChannel[] = asArray<RawLive>(rawLive).map((item, index) => {
      const streamId = toNumber(item.stream_id) ?? index;
      const name = String(item.name ?? 'Isimsiz').trim();
      const archiveDays = toNumber(item.tv_archive_duration) ?? 0;
      return {
        id: makeId(playlistId, 'live', streamId),
        playlistId,
        kind: 'live',
        name,
        searchKey: normalizeText(name),
        logo: item.stream_icon || undefined,
        categoryIds: catIds(item, 'live'),
        order: toNumber(item.num) ?? index,
        tvgId: item.epg_channel_id ?? undefined,
        url: this.liveUrl(streamId),
        streamId,
        catchup: String(item.tv_archive ?? '0') === '1' ? 'xtream' : undefined,
        catchupDays: archiveDays > 0 ? archiveDays : undefined,
        channelNumber: toNumber(item.num),
      };
    });

    const movies: MovieItem[] = asArray<RawVod>(rawVod).map((item, index) => {
      const streamId = toNumber(item.stream_id) ?? index;
      const name = String(item.name ?? 'Isimsiz').trim();
      const ext = item.container_extension || 'mp4';
      return {
        id: makeId(playlistId, 'movie', streamId),
        playlistId,
        kind: 'movie',
        name,
        searchKey: normalizeText(name),
        logo: item.stream_icon || item.cover || undefined,
        categoryIds: catIds(item, 'movie'),
        order: toNumber(item.num) ?? index,
        url: this.movieUrl(streamId, ext),
        streamId,
        containerExtension: ext,
        rating: toNumber(item.rating),
        year: toNumber(item.year) ?? toNumber(item.releasedate?.slice(0, 4)),
      };
    });

    const series: SeriesItem[] = asArray<RawSeries>(rawSeries).map((item, index) => {
      const seriesId = toNumber(item.series_id) ?? index;
      const name = String(item.name ?? 'Isimsiz').trim();
      const backdrop = Array.isArray(item.backdrop_path) ? item.backdrop_path[0] : item.backdrop_path;
      const release = item.releaseDate ?? item.release_date;
      return {
        id: makeId(playlistId, 'series', seriesId),
        playlistId,
        kind: 'series',
        name,
        searchKey: normalizeText(name),
        logo: item.cover || undefined,
        categoryIds: catIds(item, 'series'),
        order: toNumber(item.num) ?? index,
        seriesId,
        plot: item.plot || undefined,
        cast: item.cast || undefined,
        director: item.director || undefined,
        genre: item.genre || undefined,
        rating: toNumber(item.rating),
        year: toNumber(release?.slice(0, 4)),
        backdrop: backdrop || undefined,
        lastModified: toNumber(item.last_modified),
      };
    });

    return {
      playlistId,
      live,
      movies,
      series,
      categories: [...liveCats, ...vodCats, ...seriesCats],
      fetchedAt: Date.now(),
    };
  }

  /** Film detay bilgisi (konu, sure, oyuncular). */
  async fetchMovieDetails(movie: MovieItem, signal?: AbortSignal): Promise<MovieItem> {
    if (movie.streamId === undefined) return movie;
    const raw = await httpGetJson<{ info?: Record<string, unknown>; movie_data?: Record<string, unknown> }>(
      this.apiUrl({ action: 'get_vod_info', vod_id: movie.streamId }),
      { ...this.fetchOptions, signal },
    );
    const info = raw.info ?? {};
    const data = raw.movie_data ?? {};
    const backdrops = info['backdrop_path'];
    return {
      ...movie,
      plot: (info['plot'] as string) || (info['description'] as string) || movie.plot,
      cast: (info['cast'] as string) || (info['actors'] as string) || movie.cast,
      director: (info['director'] as string) || movie.director,
      genre: (info['genre'] as string) || movie.genre,
      rating: toNumber(info['rating']) ?? movie.rating,
      durationSecs: parseDurationSecs(info['duration'] ?? info['duration_secs']) ?? movie.durationSecs,
      backdrop: (Array.isArray(backdrops) ? (backdrops[0] as string) : (backdrops as string)) || movie.backdrop,
      trailerYoutubeId: (info['youtube_trailer'] as string) || movie.trailerYoutubeId,
      tmdbId: (info['tmdb_id'] as string | undefined)?.toString() ?? movie.tmdbId,
      containerExtension: (data['container_extension'] as string) || movie.containerExtension,
      year: toNumber(info['releasedate']?.toString().slice(0, 4)) ?? movie.year,
    };
  }

  /** Dizi detayi: sezonlar ve bolumler. */
  async fetchSeriesDetails(series: SeriesItem, signal?: AbortSignal): Promise<SeriesItem> {
    if (series.seriesId === undefined) return series;
    const raw = await httpGetJson<{
      info?: Record<string, unknown>;
      seasons?: Record<string, unknown>[];
      episodes?: Record<string, Record<string, unknown>[]> | Record<string, unknown>[];
    }>(this.apiUrl({ action: 'get_series_info', series_id: series.seriesId }), { ...this.fetchOptions, signal });

    const info = raw.info ?? {};
    const seasonMeta = new Map<number, Record<string, unknown>>();
    for (const season of asArray<Record<string, unknown>>(raw.seasons)) {
      const num = toNumber(season['season_number']);
      if (num !== undefined) seasonMeta.set(num, season);
    }

    const episodesBySeason: Record<string, Record<string, unknown>[]> = Array.isArray(raw.episodes)
      ? { '1': raw.episodes as Record<string, unknown>[] }
      : (raw.episodes ?? {});

    const seasons: Season[] = Object.entries(episodesBySeason)
      .map(([key, list]) => {
        const seasonNumber = toNumber(key) ?? 1;
        const meta = seasonMeta.get(seasonNumber);
        const episodes: Episode[] = asArray<Record<string, unknown>>(list)
          .map((raw2, index) => {
            const episodeId = String(raw2['id'] ?? index);
            const ext = (raw2['container_extension'] as string) || 'mp4';
            const epInfo = (raw2['info'] ?? {}) as Record<string, unknown>;
            return {
              id: makeId(series.playlistId, 'ep', episodeId),
              seriesId: series.id,
              seasonNumber,
              episodeNumber: toNumber(raw2['episode_num']) ?? index + 1,
              title: String(raw2['title'] ?? `Bolum ${index + 1}`),
              url: this.episodeUrl(episodeId, ext),
              plot: (epInfo['plot'] as string) || undefined,
              durationSecs: parseDurationSecs(epInfo['duration'] ?? epInfo['duration_secs']),
              still: (epInfo['movie_image'] as string) || (epInfo['cover_big'] as string) || undefined,
              rating: toNumber(epInfo['rating']),
              containerExtension: ext,
            } satisfies Episode;
          })
          .sort((a, b) => a.episodeNumber - b.episodeNumber);
        return {
          seasonNumber,
          name: (meta?.['name'] as string) || `${seasonNumber}. Sezon`,
          overview: (meta?.['overview'] as string) || undefined,
          cover: (meta?.['cover'] as string) || (meta?.['cover_big'] as string) || undefined,
          episodes,
        } satisfies Season;
      })
      .filter((season) => season.episodes.length > 0)
      .sort((a, b) => a.seasonNumber - b.seasonNumber);

    const backdrops = info['backdrop_path'];
    return {
      ...series,
      plot: (info['plot'] as string) || series.plot,
      cast: (info['cast'] as string) || series.cast,
      director: (info['director'] as string) || series.director,
      genre: (info['genre'] as string) || series.genre,
      rating: toNumber(info['rating']) ?? series.rating,
      backdrop: (Array.isArray(backdrops) ? (backdrops[0] as string) : (backdrops as string)) || series.backdrop,
      seasons,
    };
  }

  /** Kanal icin kisa EPG (panel tarafindan base64 kodlanmis olarak dondurulur). */
  async fetchShortEpg(streamId: number, limit = 8, signal?: AbortSignal): Promise<{ title: string; description: string; start: number; stop: number }[]> {
    const raw = await httpGetJson<{ epg_listings?: Record<string, unknown>[] }>(
      this.apiUrl({ action: 'get_short_epg', stream_id: streamId, limit }),
      { ...this.fetchOptions, signal },
    );
    const decode = (value: unknown): string => {
      const text = String(value ?? '');
      if (!text) return '';
      try {
        if (typeof atob !== 'function') return text;
        const binary = atob(text);
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        return new TextDecoder('utf-8').decode(bytes);
      } catch {
        return text;
      }
    };
    return asArray<Record<string, unknown>>(raw.epg_listings).map((item) => ({
      title: decode(item['title']),
      description: decode(item['description']),
      start: Date.parse(String(item['start'] ?? '').replace(' ', 'T') + 'Z') || 0,
      stop: Date.parse(String(item['end'] ?? item['stop'] ?? '').replace(' ', 'T') + 'Z') || 0,
    }));
  }

  /** Cok sayida film icin detaylari sinirli es zamanlilikta doldurur. */
  async hydrateMovies(movies: readonly MovieItem[], concurrency = 4, signal?: AbortSignal): Promise<MovieItem[]> {
    return mapLimit(movies, concurrency, async (movie) => {
      try {
        return await this.fetchMovieDetails(movie, signal);
      } catch {
        return movie;
      }
    });
  }
}
