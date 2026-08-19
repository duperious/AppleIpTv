import { describe, expect, it } from 'vitest';
import { buildCatalogFromM3U } from '../src/parsers/m3u.js';
import { buildIndex, categoriesOfKind, itemsInCategory, mergeCatalogs, searchCatalog, uniquePlaylistName } from '../src/library/catalog.js';
import { DEFAULT_SETTINGS, continueWatching, createProfile, isAdultCategory, setPin, updateProgress, verifyPin } from '../src/library/profiles.js';
import { normalizeText, channelMatchKey, withProxy } from '../src/utils.js';
import type { Playlist, WatchProgress } from '../src/types.js';

const M3U = `#EXTM3U
#EXTINF:-1 tvg-id="a" group-title="Spor",beIN SPORTS 1 FHD
http://x/live/1.ts
#EXTINF:-1 tvg-id="b" group-title="Spor",S Sport Plus
http://x/live/2.ts
#EXTINF:-1 group-title="Filmler",Inception (2010)
http://x/movie/3.mp4
#EXTINF:-1 group-title="Filmler",Interstellar (2014)
http://x/movie/4.mp4
`;

const catalog = buildCatalogFromM3U('pl1', M3U);

describe('arama', () => {
  it('Turkce karakterleri ve buyuk/kucuk harfi yok sayar', () => {
    expect(normalizeText('BeIN SPÖRTS Ğ')).toBe('bein sports g');
    expect(channelMatchKey('TR | beIN Sports 1 FHD')).toBe('bein sports 1');
  });

  it('tam eslesmeyi one alir', () => {
    const results = searchCatalog(catalog, 'inception');
    expect(results[0]!.name).toBe('Inception (2010)');
  });

  it('tur filtresine uyar', () => {
    expect(searchCatalog(catalog, 'sport', { kinds: ['movie'] })).toHaveLength(0);
    expect(searchCatalog(catalog, 'sport', { kinds: ['live'] })).toHaveLength(2);
  });

  it('gizli kategorileri eler', () => {
    const sporId = catalog.categories.find((c) => c.name === 'Spor')!.id;
    expect(searchCatalog(catalog, 'sport', { hiddenCategoryIds: new Set([sporId]) })).toHaveLength(0);
  });
});

describe('katalog dizini', () => {
  const index = buildIndex(catalog);

  it('kimlige gore erisim saglar', () => {
    expect(index.byId.get(catalog.live[0]!.id)!.name).toBe('beIN SPORTS 1 FHD');
  });

  it('kategoriye gore icerik dondurur', () => {
    const sporId = catalog.categories.find((c) => c.name === 'Spor')!.id;
    expect(itemsInCategory(catalog, index, sporId)).toHaveLength(2);
  });

  it('tur bazli kategorileri alfabetik verir', () => {
    expect(categoriesOfKind(catalog, 'movie').map((c) => c.name)).toEqual(['Filmler']);
  });

  it('birden fazla katalogu birlestirir', () => {
    const other = buildCatalogFromM3U('pl2', M3U);
    expect(mergeCatalogs([catalog, other]).live).toHaveLength(4);
  });
});

describe('profiller', () => {
  it('PIN dogrulamasi yapar', async () => {
    const profile = await createProfile({ name: 'Onur', pin: '1234' });
    expect(await verifyPin(profile, '1234')).toBe(true);
    expect(await verifyPin(profile, '0000')).toBe(false);
    const cleared = await setPin(profile, null);
    expect(await verifyPin(cleared, 'herhangi')).toBe(true);
  });

  it('yetiskin kategorilerini tanir', () => {
    expect(isAdultCategory('XXX Adult')).toBe(true);
    expect(isAdultCategory('Belgesel')).toBe(false);
  });

  it('izleme ilerlemesini ve bitis durumunu hesaplar', () => {
    const progress = updateProgress(undefined, {
      itemId: 'm1', kind: 'movie', positionSecs: 6000, durationSecs: 6100, title: 'Inception',
    }, DEFAULT_SETTINGS);
    expect(progress.completed).toBe(true);
  });

  it('devam-et listesinde sadece yarim kalanlari gosterir', () => {
    const entries: WatchProgress[] = [
      { itemId: 'a', kind: 'movie', positionSecs: 900, durationSecs: 7200, updatedAt: 2, completed: false, title: 'A' },
      { itemId: 'b', kind: 'movie', positionSecs: 5, durationSecs: 7200, updatedAt: 3, completed: false, title: 'B' },
      { itemId: 'c', kind: 'movie', positionSecs: 7000, durationSecs: 7200, updatedAt: 4, completed: true, title: 'C' },
    ];
    expect(continueWatching(entries, DEFAULT_SETTINGS).map((e) => e.itemId)).toEqual(['a']);
  });
});

describe('uniquePlaylistName', () => {
  it('cakisan adlara sira numarasi ekler', () => {
    const existing = [{ name: 'Evim' } as Playlist, { name: 'Evim 2' } as Playlist];
    expect(uniquePlaylistName(existing, 'Evim')).toBe('Evim 3');
    expect(uniquePlaylistName(existing, 'Ofis')).toBe('Ofis');
  });
});

describe('withProxy', () => {
  const target = 'http://sunucu.com:8080/live/1.m3u8';

  it('proxy tanimli degilse adresi degistirmez', () => {
    expect(withProxy(target)).toBe(target);
    expect(withProxy(target, '   ')).toBe(target);
  });

  it('sonda hazir parametre varsa ikinci bir parametre eklemez', () => {
    expect(withProxy(target, 'http://localhost:8787/proxy?url=')).toBe(
      `http://localhost:8787/proxy?url=${encodeURIComponent(target)}`,
    );
    expect(withProxy(target, 'http://localhost:8787/proxy?a=1&url=')).toBe(
      `http://localhost:8787/proxy?a=1&url=${encodeURIComponent(target)}`,
    );
  });

  it('parametresiz adrese url parametresi ekler', () => {
    expect(withProxy(target, 'http://localhost:8787/proxy')).toBe(
      `http://localhost:8787/proxy?url=${encodeURIComponent(target)}`,
    );
    expect(withProxy(target, 'http://localhost:8787/proxy?token=abc')).toBe(
      `http://localhost:8787/proxy?token=abc&url=${encodeURIComponent(target)}`,
    );
  });

  it('{url} yer tutucusunu doldurur', () => {
    expect(withProxy(target, 'http://localhost:8787/get/{url}/raw')).toBe(
      `http://localhost:8787/get/${encodeURIComponent(target)}/raw`,
    );
  });

  it('zaten sarilmis adresi tekrar sarmaz', () => {
    const wrapped = withProxy(target, 'http://localhost:8787/proxy?url=');
    expect(withProxy(wrapped, 'http://localhost:8787/proxy?url=')).toBe(wrapped);
  });
});
