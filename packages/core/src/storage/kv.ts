/** Platformdan bagimsiz basit anahtar-deger deposu sozlesmesi. */
export interface KVStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  keys(prefix?: string): Promise<string[]>;
  clear(): Promise<void>;
}

/** Testler ve sunucu tarafi icin bellek ici uygulama. */
export class MemoryKVStore implements KVStore {
  private readonly map = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.map.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.map.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.map.delete(key);
  }

  async keys(prefix = ''): Promise<string[]> {
    return [...this.map.keys()].filter((key) => key.startsWith(prefix));
  }

  async clear(): Promise<void> {
    this.map.clear();
  }
}

export const StorageKeys = {
  profiles: 'profiles',
  activeProfile: 'active-profile',
  playlists: 'playlists',
  catalog: (playlistId: string) => `catalog:${playlistId}`,
  epg: (playlistId: string) => `epg:${playlistId}`,
  favorites: (profileId: string) => `favorites:${profileId}`,
  progress: (profileId: string) => `progress:${profileId}`,
  recentChannels: (profileId: string) => `recent:${profileId}`,
  settings: 'app-settings',
} as const;
