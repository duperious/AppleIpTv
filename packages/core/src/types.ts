/** Uygulamanin tum katmanlarinda paylasilan veri modelleri. */

export type SourceKind = 'm3u' | 'xtream';

export interface M3USource {
  kind: 'm3u';
  /** Uzak playlist adresi. Dosyadan yuklendiyse bos birakilir. */
  url?: string;
  /** Dosyadan yuklenen playlist icin ham metin. */
  inlineContent?: string;
  /** Istege bagli XMLTV EPG adresi (.xml veya .xml.gz). */
  epgUrl?: string;
  /** Bazi saglayicilar User-Agent kontrolu yapar. */
  userAgent?: string;
}

export interface XtreamSource {
  kind: 'xtream';
  /** Ornek: http://ornek.com:8080 (sonda / olmadan) */
  host: string;
  username: string;
  password: string;
  /** Xtream sunucusu kendi XMLTV ucunu verir; ozel bir adres icin doldurulur. */
  epgUrl?: string;
  userAgent?: string;
  /** Web tarafinda .ts yerine HLS zorlamak icin. */
  preferHls?: boolean;
}

export type Source = M3USource | XtreamSource;

export interface Playlist {
  id: string;
  name: string;
  source: Source;
  createdAt: number;
  /** Son basarili senkronizasyon zamani (ms). */
  lastSyncAt?: number;
  /** Xtream hesabinin bitis tarihi (ms) - varsa gosterilir. */
  expiresAt?: number;
  enabled: boolean;
}

export type MediaKind = 'live' | 'movie' | 'series';

export interface Category {
  id: string;
  name: string;
  kind: MediaKind;
  playlistId: string;
}

/** Canli kanal / film / dizi icin ortak taban. */
export interface MediaItemBase {
  /** playlistId ile birlestirilmis kararli kimlik. */
  id: string;
  playlistId: string;
  kind: MediaKind;
  name: string;
  /** Aksan/duzenden arindirilmis arama anahtari. */
  searchKey: string;
  logo?: string;
  categoryIds: string[];
  /** Kaynaktaki sirasi - dogal siralamayi korumak icin. */
  order: number;
}

export interface LiveChannel extends MediaItemBase {
  kind: 'live';
  /** EPG eslesmesi icin XMLTV kanal kimligi. */
  tvgId?: string;
  tvgName?: string;
  /** Dogrudan oynatma adresi (M3U) veya Xtream stream kimligi cozulur. */
  url: string;
  /** Xtream stream id - timeshift/EPG icin gerekli. */
  streamId?: number;
  /** Saglayici catchup destegi: 'default' | 'append' | 'shift' | 'flussonic' */
  catchup?: string;
  catchupSource?: string;
  catchupDays?: number;
  /** Kanal numarasi (tvg-chno). */
  channelNumber?: number;
  epgShift?: number;
}

export interface MovieItem extends MediaItemBase {
  kind: 'movie';
  url: string;
  streamId?: number;
  containerExtension?: string;
  year?: number;
  rating?: number;
  plot?: string;
  durationSecs?: number;
  genre?: string;
  cast?: string;
  director?: string;
  backdrop?: string;
  trailerYoutubeId?: string;
  tmdbId?: string;
}

export interface SeriesItem extends MediaItemBase {
  kind: 'series';
  seriesId?: number;
  year?: number;
  rating?: number;
  plot?: string;
  genre?: string;
  cast?: string;
  director?: string;
  backdrop?: string;
  lastModified?: number;
  /** Detay cagrisi sonrasi doldurulur. */
  seasons?: Season[];
}

export interface Season {
  seasonNumber: number;
  name?: string;
  overview?: string;
  cover?: string;
  episodes: Episode[];
}

export interface Episode {
  id: string;
  seriesId: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  url: string;
  plot?: string;
  durationSecs?: number;
  still?: string;
  rating?: number;
  containerExtension?: string;
}

export type MediaItem = LiveChannel | MovieItem | SeriesItem;

export interface EpgProgram {
  /** XMLTV kanal kimligi. */
  channelId: string;
  title: string;
  description?: string;
  /** Unix ms. */
  start: number;
  stop: number;
  category?: string;
  episodeNum?: string;
  icon?: string;
}

/** Kullanici profili - her profil kendi favori/gecmis/kilit ayarina sahiptir. */
export interface Profile {
  id: string;
  name: string;
  /** Emoji veya avatar anahtari. */
  avatar: string;
  createdAt: number;
  /** Cocuk profili: yetiskin kategoriler gizlenir. */
  kids: boolean;
  /** SHA-256 hex; bos ise kilit yok. */
  pinHash?: string;
  settings: ProfileSettings;
}

export interface ProfileSettings {
  /** Kaydedilen konumdan devam etmek icin esik (saniye). */
  resumeThresholdSecs: number;
  /** Bitmis sayilacak yuzde. */
  completedAtPercent: number;
  /** Acilista gidilecek ekran. */
  startScreen: 'home' | 'live' | 'movies' | 'series';
  /** Kilitli kategori kimlikleri. */
  lockedCategoryIds: string[];
  /** Gizlenen kategori kimlikleri. */
  hiddenCategoryIds: string[];
  preferredAudioLang?: string;
  preferredSubtitleLang?: string;
  /** Canli yayinda kanal degistirirken tampon suresi (sn). */
  liveBufferSecs: number;
  theme: 'dark' | 'midnight' | 'light';
  /** EPG saat dilimi kaymasi (dakika). */
  epgOffsetMinutes: number;
}

export interface FavoriteEntry {
  itemId: string;
  kind: MediaKind;
  addedAt: number;
}

export interface WatchProgress {
  itemId: string;
  kind: MediaKind;
  /** Dizi bolumu ise bolum kimligi. */
  episodeId?: string;
  positionSecs: number;
  durationSecs: number;
  updatedAt: number;
  completed: boolean;
  /** Devam-et kartinda gostermek icin. */
  title: string;
  poster?: string;
}

export interface Catalog {
  playlistId: string;
  live: LiveChannel[];
  movies: MovieItem[];
  series: SeriesItem[];
  categories: Category[];
  fetchedAt: number;
}

export interface SyncStats {
  live: number;
  movies: number;
  series: number;
  categories: number;
  durationMs: number;
}
