import { clear, createStore, del, get, keys, set } from 'idb-keyval';
import type { KVStore } from '@appleiptv/core';

const store = createStore('appleiptv', 'kv');

/**
 * IndexedDB tabanli kalici depo. Katalog dosyalari yuz binlerce kayit
 * icerebildigi icin localStorage yerine IndexedDB kullanilir.
 */
export const idbStore: KVStore = {
  async get<T>(key: string) {
    return (await get<T>(key, store)) ?? undefined;
  },
  async set<T>(key: string, value: T) {
    await set(key, value, store);
  },
  async remove(key: string) {
    await del(key, store);
  },
  async keys(prefix = '') {
    const all = await keys(store);
    return all.map(String).filter((key) => key.startsWith(prefix));
  },
  async clear() {
    await clear(store);
  },
};
