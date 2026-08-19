import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { continueWatching, recentlyAdded } from '@appleiptv/core';
import type { LiveChannel, MovieItem, SeriesItem } from '@appleiptv/core';
import { useActiveProfile, useApp, useCatalog, useHiddenCategoryIds, useCatalogIndex } from '../store/useApp';
import { Card, EmptyState, Poster, Rail } from '../components/ui';
import { PlayIcon, StarIcon } from '../components/icons';
import { usePlayback } from '../playback/PlaybackProvider';
import { useEpg } from '../hooks/useEpg';
import { percent } from '../lib/format';

export function HomePage() {
  const navigate = useNavigate();
  const catalog = useCatalog();
  const hidden = useHiddenCategoryIds(catalog);
  const profile = useActiveProfile();
  const progress = useApp((state) => state.progress);
  const favorites = useApp((state) => state.favorites);
  const recentChannelIds = useApp((state) => state.recentChannelIds);
  const playlists = useApp((state) => state.playlists);
  const { play } = usePlayback();
  const epg = useEpg();

  const index = useCatalogIndex(catalog);
  const visible = useMemo(
    () => <T extends { categoryIds: string[] }>(items: readonly T[]) =>
      items.filter((item) => !item.categoryIds.some((id) => hidden.has(id))),
    [hidden],
  );

  const resume = useMemo(
    () => (profile ? continueWatching(progress, profile.settings, 20) : []),
    [profile, progress],
  );
  const recentChannels = useMemo(
    () => recentChannelIds.map((id) => index.byId.get(id)).filter((item): item is LiveChannel => item?.kind === 'live'),
    [index, recentChannelIds],
  );
  const favoriteItems = useMemo(
    () => favorites.map((entry) => index.byId.get(entry.itemId)).filter(Boolean),
    [favorites, index],
  );
  const newMovies = useMemo(() => visible(recentlyAdded(catalog, 'movie', 24) as MovieItem[]), [catalog, visible]);
  const newSeries = useMemo(() => visible(recentlyAdded(catalog, 'series', 24) as SeriesItem[]), [catalog, visible]);

  /**
   * One cikan icerik: gorseli olan, puani en yuksek yeni film veya dizi.
   * Katalogda hicbiri yoksa kahraman bolumu gizlenir.
   */
  const featured = useMemo(() => {
    const pool = [...newMovies, ...newSeries].filter((item) => item.logo || item.backdrop);
    if (pool.length === 0) return undefined;
    return pool.slice(0, 12).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0];
  }, [newMovies, newSeries]);

  if (playlists.length === 0) {
    return (
      <EmptyState
        title="Once bir kaynak ekleyin"
        hint="Xtream Codes hesabinizla giris yapabilir veya bir M3U playlist adresi/dosyasi ekleyebilirsiniz."
        action={<button type="button" className="btn btn--primary" onClick={() => navigate('/settings/sources')}>Kaynak ekle</button>}
      />
    );
  }

  return (
    <div className="page">
      {featured && (
        <section className="hero">
          <div
            className={`hero__backdrop ${featured.backdrop ? '' : 'hero__backdrop--from-poster'}`}
            style={{ backgroundImage: `url(${featured.backdrop ?? featured.logo})` }}
          />
          <div className="hero__scrim" />
          <div className="hero__body">
            <div className="hero__poster">
              <Poster src={featured.logo} name={featured.name} />
            </div>
            <div className="hero__text">
              <span className="hero__eyebrow">{featured.kind === 'movie' ? 'Öne çıkan film' : 'Öne çıkan dizi'}</span>
              <h1>{featured.name}</h1>
              <div className="hero__meta">
                {featured.year && <span>{featured.year}</span>}
                {featured.rating ? (
                  <span className="chip chip--rating">
                    <StarIcon size={13} filled /> {featured.rating.toFixed(1)}
                  </span>
                ) : null}
                {featured.genre && <span>{featured.genre}</span>}
              </div>
              {featured.plot && <p className="hero__plot">{featured.plot}</p>}
              <div className="hero__actions">
                <button
                  type="button"
                  className="btn btn--primary btn--large"
                  onClick={() => {
                    // Filmi dogrudan baslatiyoruz; dizide once bolum secilmeli.
                    if (featured.kind === 'movie') {
                      play({
                        url: featured.url,
                        title: featured.name,
                        subtitle: featured.genre,
                        live: false,
                        itemId: featured.id,
                        kind: 'movie',
                        poster: featured.logo,
                      });
                      return;
                    }
                    navigate(`/series/${encodeURIComponent(featured.id)}`);
                  }}
                >
                  <PlayIcon size={18} /> {featured.kind === 'movie' ? 'Oynat' : 'Bolumler'}
                </button>
                <button
                  type="button"
                  className="btn btn--large"
                  onClick={() =>
                    navigate(
                      `/${featured.kind === 'movie' ? 'movies' : 'series'}/${encodeURIComponent(featured.id)}`,
                    )
                  }
                >
                  Detaylar
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {resume.length > 0 && (
        <Rail title="Izlemeye devam et">
          {resume.map((entry) => (
            <Card
              key={entry.episodeId ?? entry.itemId}
              name={entry.title}
              image={entry.poster}
              wide
              meta={`%${Math.round(percent(entry.positionSecs, entry.durationSecs))}`}
              progressPercent={percent(entry.positionSecs, entry.durationSecs)}
              onSelect={() => {
                const item = index.byId.get(entry.itemId);
                if (!item) return;
                if (item.kind === 'series') navigate(`/series/${encodeURIComponent(item.id)}`);
                else if (item.kind === 'movie') navigate(`/movies/${encodeURIComponent(item.id)}`);
              }}
            />
          ))}
        </Rail>
      )}

      {recentChannels.length > 0 && (
        <Rail title="Son izlenen kanallar">
          {recentChannels.map((channel, position) => {
            const program = epg.now(channel);
            return (
              <Card
                key={channel.id}
                name={channel.name}
                image={channel.logo}
                meta={program?.title}
                wide
                onSelect={() =>
                  play({
                    url: channel.url,
                    title: channel.name,
                    subtitle: program?.title,
                    live: true,
                    itemId: channel.id,
                    kind: 'live',
                    poster: channel.logo,
                    channelRing: { channels: recentChannels, index: position },
                  })
                }
              />
            );
          })}
        </Rail>
      )}

      {favoriteItems.length > 0 && (
        <Rail
          title="Favoriler"
          action={<button type="button" className="btn btn--ghost" onClick={() => navigate('/favorites')}>Tumu</button>}
        >
          {favoriteItems.slice(0, 20).map((item) => (
            <Card
              key={item!.id}
              name={item!.name}
              image={item!.logo}
              wide={item!.kind === 'live'}
              onSelect={() => {
                const media = item!;
                if (media.kind === 'live') {
                  play({ url: media.url, title: media.name, live: true, itemId: media.id, kind: 'live', poster: media.logo });
                } else if (media.kind === 'movie') {
                  navigate(`/movies/${encodeURIComponent(media.id)}`);
                } else {
                  navigate(`/series/${encodeURIComponent(media.id)}`);
                }
              }}
            />
          ))}
        </Rail>
      )}

      {newMovies.length > 0 && (
        <Rail
          title="Yeni filmler"
          action={<button type="button" className="btn btn--ghost" onClick={() => navigate('/movies')}>Tumu</button>}
        >
          {newMovies.map((movie) => (
            <Card
              key={movie.id}
              name={movie.name}
              image={movie.logo}
              meta={movie.year ? String(movie.year) : undefined}
              onSelect={() => navigate(`/movies/${encodeURIComponent(movie.id)}`)}
            />
          ))}
        </Rail>
      )}

      {newSeries.length > 0 && (
        <Rail
          title="Yeni diziler"
          action={<button type="button" className="btn btn--ghost" onClick={() => navigate('/series')}>Tumu</button>}
        >
          {newSeries.map((series) => (
            <Card
              key={series.id}
              name={series.name}
              image={series.logo}
              meta={series.year ? String(series.year) : undefined}
              onSelect={() => navigate(`/series/${encodeURIComponent(series.id)}`)}
            />
          ))}
        </Rail>
      )}

      {resume.length === 0 && recentChannels.length === 0 && newMovies.length === 0 && newSeries.length === 0 && (
        <EmptyState title="Katalog bos gorunuyor" hint="Kaynaklarinizi Ayarlar > Kaynaklar bolumunden yenileyin." />
      )}
    </div>
  );
}
