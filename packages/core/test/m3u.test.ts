import { describe, expect, it } from 'vitest';
import { buildCatalogFromM3U, parseEpisodeTitle, parseM3U, splitUrlHeaders } from '../src/parsers/m3u.js';

const SAMPLE = `#EXTM3U url-tvg="http://ornek.com/xmltv.php?u=1"
#EXTINF:-1 tvg-id="beinsports1.tr" tvg-name="beIN Sports 1" tvg-logo="http://logo/1.png" group-title="Spor" tvg-chno="201" catchup="default" catchup-days="7",beIN SPORTS 1 FHD
http://ornek.com:8080/live/kullanici/sifre/101.ts
#EXTINF:-1 tvg-logo="http://logo/2.png" group-title="Haber",CNN Turk
#EXTVLCOPT:http-user-agent=VLC/3.0
http://ornek.com:8080/live/kullanici/sifre/102.ts
#EXTINF:7200 tvg-logo="http://logo/m.png" group-title="Filmler",Inception (2010)
http://ornek.com:8080/movie/kullanici/sifre/555.mp4
#EXTINF:-1 group-title="Diziler",Breaking Bad S01 E02 - Cat in the Bag
http://ornek.com:8080/series/kullanici/sifre/901.mkv
#EXTINF:-1 group-title="Diziler",Breaking Bad S01 E01 - Pilot
http://ornek.com:8080/series/kullanici/sifre/900.mkv
#EXTINF:-1 group-title="Diziler",Breaking Bad S02 E01 - Seven Thirty-Seven
http://ornek.com:8080/series/kullanici/sifre/910.mkv
`;

describe('parseM3U', () => {
  it('#EXTM3U satirindan EPG adresini okur', () => {
    expect(parseM3U(SAMPLE).epgUrl).toBe('http://ornek.com/xmltv.php?u=1');
  });

  it('tum girdileri ve ozniteliklerini ayristirir', () => {
    const { entries } = parseM3U(SAMPLE);
    expect(entries).toHaveLength(6);
    expect(entries[0]!.title).toBe('beIN SPORTS 1 FHD');
    expect(entries[0]!.attributes['tvg-id']).toBe('beinsports1.tr');
    expect(entries[0]!.attributes['group-title']).toBe('Spor');
    expect(entries[1]!.options['http-user-agent']).toBe('VLC/3.0');
  });

  it('CRLF, BOM ve bos satirlari tolere eder', () => {
    const messy = '﻿#EXTM3U\r\n\r\n#EXTINF:-1,Test\r\nhttp://a/b.ts\r\n';
    expect(parseM3U(messy).entries).toHaveLength(1);
  });

  it('#EXTGRP ile gelen grup adini kullanir', () => {
    const text = '#EXTM3U\n#EXTINF:-1,Kanal\n#EXTGRP:Belgesel\nhttp://a/b.ts';
    expect(parseM3U(text).entries[0]!.attributes['group-title']).toBe('Belgesel');
  });
});

describe('buildCatalogFromM3U', () => {
  const catalog = buildCatalogFromM3U('pl1', SAMPLE);

  it('canli, film ve dizileri ayirir', () => {
    expect(catalog.live).toHaveLength(2);
    expect(catalog.movies).toHaveLength(1);
    expect(catalog.series).toHaveLength(1);
  });

  it('canli kanal ozniteliklerini tasir', () => {
    const channel = catalog.live[0]!;
    expect(channel.tvgId).toBe('beinsports1.tr');
    expect(channel.channelNumber).toBe(201);
    expect(channel.catchupDays).toBe(7);
    expect(channel.searchKey).toContain('bein sports 1');
  });

  it('dizi bolumlerini sezonlara gruplar ve sirasini duzeltir', () => {
    const series = catalog.series[0]!;
    expect(series.name).toBe('Breaking Bad');
    expect(series.seasons).toHaveLength(2);
    expect(series.seasons![0]!.episodes.map((e) => e.episodeNumber)).toEqual([1, 2]);
    expect(series.seasons![0]!.episodes[0]!.title).toBe('Pilot');
  });

  it('film yilini baslikta yakalar', () => {
    expect(catalog.movies[0]!.year).toBe(2010);
  });

  it('kategori listesini uretir', () => {
    expect(catalog.categories.map((c) => c.name).sort()).toEqual(['Diziler', 'Filmler', 'Haber', 'Spor']);
  });
});

describe('parseEpisodeTitle', () => {
  it('farkli bolum kaliplarini cozer', () => {
    expect(parseEpisodeTitle('Dark S02E07 - Der Ursprung')).toMatchObject({ seriesName: 'Dark', season: 2, episode: 7 });
    expect(parseEpisodeTitle('Yargi 1x15')).toMatchObject({ seriesName: 'Yargi', season: 1, episode: 15 });
    expect(parseEpisodeTitle('Belgesel')).toBeNull();
  });
});

describe('splitUrlHeaders', () => {
  it('adres sonundaki basliklari ayirir', () => {
    const result = splitUrlHeaders('http://a/b.ts|User-Agent=Mozilla&Referer=http%3A%2F%2Fx');
    expect(result.url).toBe('http://a/b.ts');
    expect(result.headers['User-Agent']).toBe('Mozilla');
    expect(result.headers['Referer']).toBe('http://x');
  });
});
