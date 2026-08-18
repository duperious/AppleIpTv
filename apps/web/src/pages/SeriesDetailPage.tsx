import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { XtreamClient } from '@appleiptv/core';
import type { Episode, SeriesItem } from '@appleiptv/core';
import { useApp, useCatalog, useCatalogIndex } from '../store/useApp';
import { EmptyState, Poster, Spinner } from '../components/ui';
import { usePlayback } from '../playback/PlaybackProvider';
import type { PlayRequest } from '../playback/PlaybackProvider';
import { formatRuntime, percent } from '../lib/format';

export function SeriesDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const catalog = useCatalog();
  const playlists = useApp((state) => state.playlists);
  const settings = useApp((state) => state.settings);
  const progress = useApp((state) => state.progress);
  const isFavorite = useApp((state) => state.isFavorite);
  const toggleFavorite = useApp((state) => state.toggleFavorite);
  const { play } = usePlayback();

  const index = useCatalogIndex(catalog);
  const base = index.byId.get(decodeURIComponent(id));
  const [series, setSeries] = useState<SeriesItem | undefined>(base?.kind === 'series' ? base : undefined);
  const [loading, setLoading] = useState(false);
  const [seasonNumber, setSeasonNumber] = useState<number | undefined>();

  useEffect(() => {
    if (!series || series.seasons?.length) return;
    const playlist = playlists.find((item) => item.id === series.playlistId);
    if (!playlist || playlist.source.kind !== 'xtream') return;
    let cancelled = false;
    setLoading(true);
    const client = new XtreamClient(
      { ...playlist.source, preferHls: settings.preferHls },
      { proxyUrl: settings.proxyUrl || undefined },
    );
    client
      .fetchSeriesDetails(series)
      .then((detailed) => {
        if (!cancelled) setSeries(detailed);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [playlists, series, settings.preferHls, settings.proxyUrl]);

  const seasons = series?.seasons ?? [];
  const activeSeason = seasons.find((season) => season.seasonNumber === seasonNumber) ?? seasons[0];

  const buildRequest = (episode: Episode, list: Episode[]): PlayRequest => {
    const position = list.findIndex((item) => item.id === episode.id);
    const following = list[position + 1];
    const watched = progress.find((entry) => entry.episodeId === episode.id);
    return {
      url: episode.url,
      title: `${series?.name ?? ''} · S${episode.seasonNumber}B${episode.episodeNumber}`,
      subtitle: episode.title,
      live: false,
      itemId: series?.id ?? episode.seriesId,
      episodeId: episode.id,
      kind: 'series',
      poster: series?.logo,
      startPositionSecs: watched && !watched.completed ? watched.positionSecs : undefined,
      next: following ? buildRequestShallow(following) : undefined,
    };
  };

  // Zincirin sonsuz buyumesini onlemek icin sonraki bolum tek adim tasinir.
  const buildRequestShallow = (episode: Episode): PlayRequest => ({
    url: episode.url,
    title: `${series?.name ?? ''} · S${episode.seasonNumber}B${episode.episodeNumber}`,
    subtitle: episode.title,
    live: false,
    itemId: series?.id ?? episode.seriesId,
    episodeId: episode.id,
    kind: 'series',
    poster: series?.logo,
  });

  if (!series) {
    return (
      <EmptyState
        title="Dizi bulunamadi"
        action={<button type="button" className="btn" onClick={() => navigate('/series')}>Dizilere don</button>}
      />
    );
  }

  return (
    <div className="detail">
      {series.backdrop && <div className="detail__backdrop" style={{ backgroundImage: `url(${series.backdrop})` }} />}
      <div className="detail__content">
        <div className="detail__poster">
          <Poster src={series.logo} name={series.name} />
        </div>
        <div className="detail__info">
          <h1>{series.name}</h1>
          <div className="detail__meta">
            {series.year && <span>{series.year}</span>}
            {series.rating ? <span>★ {series.rating}</span> : null}
            {series.genre && <span>{series.genre}</span>}
            {seasons.length > 0 && <span>{seasons.length} sezon</span>}
          </div>
          {series.plot && <p className="detail__plot">{series.plot}</p>}
          {series.cast && <p className="detail__credits"><strong>Oyuncular:</strong> {series.cast}</p>}
          <div className="detail__actions">
            <button type="button" className="btn btn--ghost" onClick={() => void toggleFavorite(series)}>
              {isFavorite(series.id) ? '★ Favorilerden cikar' : '☆ Favorilere ekle'}
            </button>
          </div>
        </div>
      </div>

      {loading && <Spinner label="Bolumler yukleniyor" />}

      {seasons.length > 0 && (
        <>
          <div className="tabs tabs--seasons">
            {seasons.map((season) => (
              <button
                key={season.seasonNumber}
                type="button"
                className={activeSeason?.seasonNumber === season.seasonNumber ? 'is-active' : ''}
                onClick={() => setSeasonNumber(season.seasonNumber)}
              >
                {season.name ?? `${season.seasonNumber}. Sezon`}
              </button>
            ))}
          </div>

          <ul className="episodes">
            {(activeSeason?.episodes ?? []).map((episode) => {
              const watched = progress.find((entry) => entry.episodeId === episode.id);
              return (
                <li key={episode.id}>
                  <button
                    type="button"
                    className="episode"
                    onClick={() => play(buildRequest(episode, activeSeason?.episodes ?? []))}
                  >
                    <div className="episode__still">
                      <Poster src={episode.still ?? series.logo} name={episode.title} wide />
                    </div>
                    <div className="episode__text">
                      <strong>
                        {episode.episodeNumber}. {episode.title}
                      </strong>
                      {episode.durationSecs ? <span>{formatRuntime(episode.durationSecs)}</span> : null}
                      {episode.plot && <p>{episode.plot}</p>}
                      {watched && watched.durationSecs > 0 && (
                        <div className="episode__progress">
                          <div style={{ width: `${percent(watched.positionSecs, watched.durationSecs)}%` }} />
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {!loading && seasons.length === 0 && <p className="form__hint">Bu dizi icin bolum bilgisi bulunamadi.</p>}
    </div>
  );
}
