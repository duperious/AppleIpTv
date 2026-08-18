import { create } from 'zustand';
import {
  StorageKeys,
  buildIndex,
  createProfile as createProfileRecord,
  indexPrograms,
  isAdultCategory,
  loadEpg,
  loadPlaylist,
  mergeCatalogs,
  randomId,
  updateProgress,
  uniquePlaylistName,
} from '@appleiptv/core';
import type {
  Catalog,
  CatalogIndex,
  EpgProgram,
  FavoriteEntry,
  MediaItem,
  Playlist,
  Profile,
  ProfileSettings,
  Source,
  WatchProgress,
} from '@appleiptv/core';
import type { EpgIndex } from '@appleiptv/core';
import { idbStore } from './db';

export interface AppSettings {
  /** CORS engellerini asmak icin kullanilan proxy adresi. */
  proxyUrl: string;
  /** Xtream canli yayinlarinda HLS tercih et (tarayicida daha uyumlu). */
  preferHls: boolean;
  /** EPG'yi kac saatte bir tazele. */
  epgRefreshHours: number;
  /** Katalogu kac saatte bir tazele. */
  catalogRefreshHours: number;
}

const DEFAULT_APP_SETTINGS: AppSettings = {
  proxyUrl: '',
  preferHls: true,
  epgRefreshHours: 12,
  catalogRefreshHours: 24,
};

export interface SyncState {
  playlistId: string;
  stage: string;
  done: number;
  total: number;
}

interface EpgBundleState {
  index: EpgIndex;
  channelIdMap: Map<string, string>;
  fetchedAt: number;
}

interface PersistedEpg {
  programs: EpgProgram[];
  channelIdMap: [string, string][];
  fetchedAt: number;
}

export interface AppState {
  ready: boolean;
  profiles: Profile[];
  activeProfileId?: string;
  playlists: Playlist[];
  catalogs: Record<string, Catalog>;
  epg: Record<string, EpgBundleState>;
  favorites: FavoriteEntry[];
  progress: WatchProgress[];
  recentChannelIds: string[];
  settings: AppSettings;
  sync?: SyncState;
  error?: string;
  /** Bu oturumda PIN ile acilmis kategoriler. */
  unlockedCategoryIds: string[];

  init: () => Promise<void>;
  setError: (message?: string) => void;

  addProfile: (input: { name: string; avatar?: string; kids?: boolean; pin?: string }) => Promise<Profile>;
  selectProfile: (profileId: string) => Promise<void>;
  updateProfile: (profileId: string, patch: Partial<Profile>) => Promise<void>;
  updateSettings: (patch: Partial<ProfileSettings>) => Promise<void>;
  removeProfile: (profileId: string) => Promise<void>;

  addPlaylist: (name: string, source: Source) => Promise<Playlist>;
  syncPlaylist: (playlistId: string, options?: { force?: boolean }) => Promise<void>;
  syncAll: (options?: { force?: boolean }) => Promise<void>;
  removePlaylist: (playlistId: string) => Promise<void>;
  togglePlaylist: (playlistId: string, enabled: boolean) => Promise<void>;

  updateAppSettings: (patch: Partial<AppSettings>) => Promise<void>;

  toggleFavorite: (item: MediaItem) => Promise<void>;
  isFavorite: (itemId: string) => boolean;
  saveProgress: (patch: Omit<WatchProgress, 'updatedAt' | 'completed'>) => Promise<void>;
  clearProgress: (itemId: string) => Promise<void>;
  pushRecentChannel: (channelId: string) => Promise<void>;
  unlockCategory: (categoryId: string) => void;
}

const activeProfile = (state: AppState): Profile | undefined =>
  state.profiles.find((profile) => profile.id === state.activeProfileId);

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  profiles: [],
  playlists: [],
  catalogs: {},
  epg: {},
  favorites: [],
  progress: [],
  recentChannelIds: [],
  settings: DEFAULT_APP_SETTINGS,
  unlockedCategoryIds: [],

  setError: (message) => set({ error: message }),

  async init() {
    const [profiles, activeProfileId, playlists, settings] = await Promise.all([
      idbStore.get<Profile[]>(StorageKeys.profiles),
      idbStore.get<string>(StorageKeys.activeProfile),
      idbStore.get<Playlist[]>(StorageKeys.playlists),
      idbStore.get<AppSettings>(StorageKeys.settings),
    ]);

    const catalogs: Record<string, Catalog> = {};
    const epg: Record<string, EpgBundleState> = {};
    for (const playlist of playlists ?? []) {
      const catalog = await idbStore.get<Catalog>(StorageKeys.catalog(playlist.id));
      if (catalog) catalogs[playlist.id] = catalog;
      const stored = await idbStore.get<PersistedEpg>(StorageKeys.epg(playlist.id));
      if (stored) {
        epg[playlist.id] = {
          index: indexPrograms(stored.programs),
          channelIdMap: new Map(stored.channelIdMap),
          fetchedAt: stored.fetchedAt,
        };
      }
    }

    const resolvedProfileId =
      activeProfileId && profiles?.some((p) => p.id === activeProfileId) ? activeProfileId : undefined;

    set({
      profiles: profiles ?? [],
      activeProfileId: resolvedProfileId,
      playlists: playlists ?? [],
      catalogs,
      epg,
      settings: { ...DEFAULT_APP_SETTINGS, ...settings },
      ready: true,
    });

    if (resolvedProfileId) await loadProfileData(resolvedProfileId, set);
  },

  async addProfile(input) {
    const profile = await createProfileRecord(input);
    const profiles = [...get().profiles, profile];
    set({ profiles });
    await idbStore.set(StorageKeys.profiles, profiles);
    return profile;
  },

  async selectProfile(profileId) {
    set({ activeProfileId: profileId, unlockedCategoryIds: [] });
    await idbStore.set(StorageKeys.activeProfile, profileId);
    await loadProfileData(profileId, set);
  },

  async updateProfile(profileId, patch) {
    const profiles = get().profiles.map((profile) =>
      profile.id === profileId ? { ...profile, ...patch } : profile,
    );
    set({ profiles });
    await idbStore.set(StorageKeys.profiles, profiles);
  },

  async updateSettings(patch) {
    const profileId = get().activeProfileId;
    if (!profileId) return;
    const profiles = get().profiles.map((profile) =>
      profile.id === profileId ? { ...profile, settings: { ...profile.settings, ...patch } } : profile,
    );
    set({ profiles });
    await idbStore.set(StorageKeys.profiles, profiles);
  },

  async removeProfile(profileId) {
    const profiles = get().profiles.filter((profile) => profile.id !== profileId);
    set({ profiles, activeProfileId: get().activeProfileId === profileId ? undefined : get().activeProfileId });
    await idbStore.set(StorageKeys.profiles, profiles);
    await idbStore.remove(StorageKeys.favorites(profileId));
    await idbStore.remove(StorageKeys.progress(profileId));
    await idbStore.remove(StorageKeys.recentChannels(profileId));
  },

  async addPlaylist(name, source) {
    const playlists = get().playlists;
    const playlist: Playlist = {
      id: randomId('pl'),
      name: uniquePlaylistName(playlists, name.trim() || 'Kaynak'),
      source,
      createdAt: Date.now(),
      enabled: true,
    };
    const next = [...playlists, playlist];
    set({ playlists: next });
    await idbStore.set(StorageKeys.playlists, next);
    await get().syncPlaylist(playlist.id, { force: true });
    return playlist;
  },

  async syncPlaylist(playlistId, options = {}) {
    const state = get();
    const playlist = state.playlists.find((item) => item.id === playlistId);
    if (!playlist) return;

    const maxAge = state.settings.catalogRefreshHours * 3600_000;
    if (!options.force && playlist.lastSyncAt && Date.now() - playlist.lastSyncAt < maxAge) return;

    const source: Source =
      playlist.source.kind === 'xtream'
        ? { ...playlist.source, preferHls: state.settings.preferHls }
        : playlist.source;

    set({ sync: { playlistId, stage: 'Baslatiliyor', done: 0, total: 1 }, error: undefined });
    try {
      const result = await loadPlaylist(
        { ...playlist, source },
        {
          proxyUrl: state.settings.proxyUrl || undefined,
          onProgress: (stage, done, total) => set({ sync: { playlistId, stage, done, total } }),
        },
      );

      const catalogs = { ...get().catalogs, [playlistId]: result.catalog };
      const playlists = get().playlists.map((item) =>
        item.id === playlistId ? { ...item, lastSyncAt: Date.now(), expiresAt: result.expiresAt } : item,
      );
      set({ catalogs, playlists });
      await idbStore.set(StorageKeys.catalog(playlistId), result.catalog);
      await idbStore.set(StorageKeys.playlists, playlists);

      if (result.epgUrl) {
        set({ sync: { playlistId, stage: 'EPG indiriliyor', done: 0, total: 1 } });
        try {
          const bundle = await loadEpg(result.epgUrl, result.catalog.live, {
            proxyUrl: state.settings.proxyUrl || undefined,
          });
          set({
            epg: {
              ...get().epg,
              [playlistId]: {
                index: bundle.index,
                channelIdMap: bundle.channelIdMap,
                fetchedAt: bundle.fetchedAt,
              },
            },
          });
          const persisted: PersistedEpg = {
            programs: bundle.programs,
            channelIdMap: [...bundle.channelIdMap.entries()],
            fetchedAt: bundle.fetchedAt,
          };
          await idbStore.set(StorageKeys.epg(playlistId), persisted);
        } catch (epgError) {
          // EPG basarisiz olsa da katalog kullanilabilir kalmali.
          console.warn('EPG yuklenemedi', epgError);
        }
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      set({ sync: undefined });
    }
  },

  async syncAll(options = {}) {
    for (const playlist of get().playlists.filter((item) => item.enabled)) {
      try {
        await get().syncPlaylist(playlist.id, options);
      } catch {
        // Tek kaynagin hatasi digerlerini engellemesin.
      }
    }
  },

  async removePlaylist(playlistId) {
    const playlists = get().playlists.filter((item) => item.id !== playlistId);
    const catalogs = { ...get().catalogs };
    const epg = { ...get().epg };
    delete catalogs[playlistId];
    delete epg[playlistId];
    set({ playlists, catalogs, epg });
    await idbStore.set(StorageKeys.playlists, playlists);
    await idbStore.remove(StorageKeys.catalog(playlistId));
    await idbStore.remove(StorageKeys.epg(playlistId));
  },

  async togglePlaylist(playlistId, enabled) {
    const playlists = get().playlists.map((item) => (item.id === playlistId ? { ...item, enabled } : item));
    set({ playlists });
    await idbStore.set(StorageKeys.playlists, playlists);
  },

  async updateAppSettings(patch) {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    await idbStore.set(StorageKeys.settings, settings);
  },

  async toggleFavorite(item) {
    const profileId = get().activeProfileId;
    if (!profileId) return;
    const exists = get().favorites.some((entry) => entry.itemId === item.id);
    const favorites = exists
      ? get().favorites.filter((entry) => entry.itemId !== item.id)
      : [...get().favorites, { itemId: item.id, kind: item.kind, addedAt: Date.now() }];
    set({ favorites });
    await idbStore.set(StorageKeys.favorites(profileId), favorites);
  },

  isFavorite(itemId) {
    return get().favorites.some((entry) => entry.itemId === itemId);
  },

  async saveProgress(patch) {
    const state = get();
    const profileId = state.activeProfileId;
    const profile = activeProfile(state);
    if (!profileId || !profile) return;
    const key = patch.episodeId ?? patch.itemId;
    const current = state.progress.find((entry) => (entry.episodeId ?? entry.itemId) === key);
    const next = updateProgress(current, patch, profile.settings);
    const progress = [next, ...state.progress.filter((entry) => (entry.episodeId ?? entry.itemId) !== key)].slice(0, 200);
    set({ progress });
    await idbStore.set(StorageKeys.progress(profileId), progress);
  },

  async clearProgress(itemId) {
    const profileId = get().activeProfileId;
    if (!profileId) return;
    const progress = get().progress.filter((entry) => entry.itemId !== itemId && entry.episodeId !== itemId);
    set({ progress });
    await idbStore.set(StorageKeys.progress(profileId), progress);
  },

  async pushRecentChannel(channelId) {
    const profileId = get().activeProfileId;
    if (!profileId) return;
    const recentChannelIds = [channelId, ...get().recentChannelIds.filter((id) => id !== channelId)].slice(0, 30);
    set({ recentChannelIds });
    await idbStore.set(StorageKeys.recentChannels(profileId), recentChannelIds);
  },

  unlockCategory(categoryId) {
    if (get().unlockedCategoryIds.includes(categoryId)) return;
    set({ unlockedCategoryIds: [...get().unlockedCategoryIds, categoryId] });
  },
}));

async function loadProfileData(profileId: string, set: (partial: Partial<AppState>) => void): Promise<void> {
  const [favorites, progress, recentChannelIds] = await Promise.all([
    idbStore.get<FavoriteEntry[]>(StorageKeys.favorites(profileId)),
    idbStore.get<WatchProgress[]>(StorageKeys.progress(profileId)),
    idbStore.get<string[]>(StorageKeys.recentChannels(profileId)),
  ]);
  set({
    favorites: favorites ?? [],
    progress: progress ?? [],
    recentChannelIds: recentChannelIds ?? [],
  });
}

/** Etkin kaynaklarin birlesik katalogu. */
export function useCatalog(): Catalog {
  const playlists = useApp((state) => state.playlists);
  const catalogs = useApp((state) => state.catalogs);
  const enabled = playlists.filter((playlist) => playlist.enabled);
  return mergeCatalogs(enabled.map((playlist) => catalogs[playlist.id]).filter(Boolean) as Catalog[]);
}

export function useCatalogIndex(catalog: Catalog): CatalogIndex {
  return buildIndex(catalog);
}

export function useActiveProfile(): Profile | undefined {
  return useApp((state) => state.profiles.find((profile) => profile.id === state.activeProfileId));
}

/** Cocuk profilinde ve gizlenen kategorilerde saklanacak kategori kimlikleri. */
export function useHiddenCategoryIds(catalog: Catalog): Set<string> {
  const profile = useActiveProfile();
  const hidden = new Set<string>(profile?.settings.hiddenCategoryIds ?? []);
  if (profile?.kids) {
    for (const category of catalog.categories) {
      if (isAdultCategory(category.name)) hidden.add(category.id);
    }
  }
  return hidden;
}
