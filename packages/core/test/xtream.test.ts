import { afterEach, describe, expect, it, vi } from 'vitest';
import { XtreamClient, normalizeHost } from '../src/xtream/client.js';
import type { XtreamSource } from '../src/types.js';

const source: XtreamSource = { kind: 'xtream', host: 'ornek.com:8080', username: 'ali', password: 's/e?f' };
const client = new XtreamClient(source);

function mockJson(payload: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
}

afterEach(() => vi.unstubAllGlobals());

describe('normalizeHost', () => {
  it('sema ekler ve sondaki egik cizgiyi atar', () => {
    expect(normalizeHost('ornek.com:8080')).toBe('http://ornek.com:8080');
    expect(normalizeHost('https://ornek.com/')).toBe('https://ornek.com');
  });
});

describe('adres uretimi', () => {
  it('canli, film ve bolum adreslerini kurar, ozel karakterleri kacisla yazar', () => {
    expect(client.liveUrl(101)).toBe('http://ornek.com:8080/live/ali/s%2Fe%3Ff/101.ts');
    expect(client.movieUrl(555, 'mkv')).toBe('http://ornek.com:8080/movie/ali/s%2Fe%3Ff/555.mkv');
    expect(client.episodeUrl('900', 'mp4')).toBe('http://ornek.com:8080/series/ali/s%2Fe%3Ff/900.mp4');
  });

  it('HLS tercihi acikken m3u8 uretir', () => {
    const hls = new XtreamClient({ ...source, preferHls: true });
    expect(hls.liveUrl(101)).toContain('/101.m3u8');
  });

  it('timeshift adresini panelin bekledigi bicimde kurar', () => {
    const url = client.timeshiftUrl(101, new Date(2025, 0, 5, 21, 30), 90);
    expect(url).toContain('start=2025-01-05%3A21-30');
    expect(url).toContain('duration=90');
  });

  it('EPG adresini uretir', () => {
    expect(client.epgUrl()).toBe('http://ornek.com:8080/xmltv.php?username=ali&password=s%2Fe%3Ff');
  });
});

describe('authenticate', () => {
  it('gecerli hesabi cozer', async () => {
    vi.stubGlobal('fetch', mockJson({
      user_info: { username: 'ali', auth: 1, status: 'Active', exp_date: '1767225600', max_connections: '2', allowed_output_formats: ['m3u8', 'ts'] },
      server_info: { url: 'ornek.com', port: '8080' },
    }));
    const account = await client.authenticate();
    expect(account.user.username).toBe('ali');
    expect(account.user.maxConnections).toBe(2);
    expect(account.server.port).toBe('8080');
  });

  it('reddedilen girisi hataya cevirir', async () => {
    vi.stubGlobal('fetch', mockJson({ user_info: { auth: 0, status: 'Banned' } }));
    await expect(client.authenticate()).rejects.toThrow(/reddedildi/);
  });

  it('JSON olmayan yaniti anlasilir hataya cevirir', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>403</html>', { status: 200 })));
    await expect(client.authenticate()).rejects.toThrow(/JSON/);
  });
});

describe('fetchCatalog', () => {
  it('kategori ve icerikleri normalize eder', async () => {
    const responses: Record<string, unknown> = {
      get_live_categories: [{ category_id: '1', category_name: 'Spor' }],
      get_vod_categories: [{ category_id: '9', category_name: 'Aksiyon' }],
      get_series_categories: [{ category_id: '4', category_name: 'Drama' }],
      get_live_streams: [{ stream_id: 101, name: 'beIN Sports 1', category_id: '1', num: 3, epg_channel_id: 'bein1', tv_archive: '1', tv_archive_duration: '5' }],
      get_vod_streams: [{ stream_id: 555, name: 'Inception', category_id: '9', container_extension: 'mkv', rating: '8.8', year: '2010' }],
      get_series: [{ series_id: 77, name: 'Dark', category_id: '4', releaseDate: '2017-12-01', backdrop_path: ['http://b/1.jpg'] }],
    };
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = String(input);
      const action = new URL(url).searchParams.get('action') ?? '';
      return new Response(JSON.stringify(responses[action] ?? []), { status: 200 });
    }));

    const catalog = await client.fetchCatalog('pl1');
    expect(catalog.categories).toHaveLength(3);
    expect(catalog.live[0]).toMatchObject({ id: 'pl1:live:101', tvgId: 'bein1', catchupDays: 5, order: 3 });
    expect(catalog.live[0]!.categoryIds).toEqual(['pl1:cat-live:1']);
    expect(catalog.movies[0]).toMatchObject({ year: 2010, rating: 8.8, containerExtension: 'mkv' });
    expect(catalog.movies[0]!.url).toContain('/movie/ali/s%2Fe%3Ff/555.mkv');
    expect(catalog.series[0]).toMatchObject({ year: 2017, backdrop: 'http://b/1.jpg' });
  });
});

describe('fetchSeriesDetails', () => {
  it('sezon ve bolumleri siralar', async () => {
    vi.stubGlobal('fetch', mockJson({
      info: { plot: 'Zaman yolculugu', rating: '8.7' },
      seasons: [{ season_number: 1, name: '1. Sezon', cover: 'http://c/1.jpg' }],
      episodes: {
        '1': [
          { id: '12', episode_num: '2', title: 'Sirlar', container_extension: 'mkv', info: { duration: '00:45:00' } },
          { id: '11', episode_num: '1', title: 'Gizemler', container_extension: 'mkv', info: { duration: '00:51:00' } },
        ],
      },
    }));
    const detailed = await client.fetchSeriesDetails({
      id: 'pl1:series:77', playlistId: 'pl1', kind: 'series', name: 'Dark', searchKey: 'dark',
      categoryIds: [], order: 0, seriesId: 77,
    });
    expect(detailed.plot).toBe('Zaman yolculugu');
    expect(detailed.seasons).toHaveLength(1);
    expect(detailed.seasons![0]!.episodes.map((e) => e.episodeNumber)).toEqual([1, 2]);
    expect(detailed.seasons![0]!.episodes[0]!.durationSecs).toBe(3060);
    expect(detailed.seasons![0]!.episodes[0]!.url).toContain('/series/ali/s%2Fe%3Ff/11.mkv');
  });
});
