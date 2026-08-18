import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { XtreamClient } from '@appleiptv/core';
import type { MovieItem } from '@appleiptv/core';
import { useApp, useCatalog, useCatalogIndex } from '../store/useApp';
import { EmptyState, Poster, Spinner } from '../components/ui';
import { usePlayback } from '../playback/PlaybackProvider';
import { formatRuntime, percent } from '../lib/format';

export function MovieDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const catalog = useCatalog();
  const playlists = useApp((state) => state.playlists);
  const settings = useApp((state) => state.settings);
  const progress = useApp((state) => state.progress);
  const isFavorite = useApp((state) => state.isFavorite);
  const toggleFavorite = useApp((state) => state.toggleFavorite);
  const clearProgress = useApp((state) => state.clearProgress);
  const { play } = usePlayback();

  const index = useCatalogIndex(catalog);
  const base = index.byId.get(decodeURIComponent(id));
  const [movie, setMovie] = useState<MovieItem | undefined>(base?.kind === 'movie' ? base : undefined);
  const [loading, setLoading] = useState(false);

  // Xtream kaynaklarinda detay bilgisi ayri bir cagri ile gelir.
  useEffect(() => {
    if (!movie || movie.plot) return;
    const playlist = playlists.find((item) => item.id === movie.playlistId);
    if (!playlist || playlist.source.kind !== 'xtream') return;
    let cancelled = false;
    setLoading(true);
    const client = new XtreamClient(
      { ...playlist.source, preferHls: settings.preferHls },
      { proxyUrl: settings.proxyUrl || undefined },
    );
    client
      .fetchMovieDetails(movie)
      .then((detailed) => {
        if (!cancelled) setMovie(detailed);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [movie, playlists, settings.preferHls, settings.proxyUrl]);

  const watched = progress.find((entry) => entry.itemId === movie?.id);

  if (!movie) return <EmptyState title="Film bulunamadi" action={<button type="button" className="btn" onClick={() => navigate('/movies')}>Filmlere don</button>} />;

  const start = () =>
    play({
      url: movie.url,
      title: movie.name,
      subtitle: movie.genre,
      live: false,
      itemId: movie.id,
      kind: 'movie',
      poster: movie.logo,
      startPositionSecs: watched && !watched.completed ? watched.positionSecs : undefined,
    });

  return (
    <div className="detail">
      {movie.backdrop && <div className="detail__backdrop" style={{ backgroundImage: `url(${movie.backdrop})` }} />}
      <div className="detail__content">
        <div className="detail__poster">
          <Poster src={movie.logo} name={movie.name} />
        </div>
        <div className="detail__info">
          <h1>{movie.name}</h1>
          <div className="detail__meta">
            {movie.year && <span>{movie.year}</span>}
            {movie.rating ? <span>★ {movie.rating}</span> : null}
            {movie.durationSecs ? <span>{formatRuntime(movie.durationSecs)}</span> : null}
            {movie.genre && <span>{movie.genre}</span>}
          </div>
          {loading && <Spinner label="Detaylar yukleniyor" />}
          {movie.plot && <p className="detail__plot">{movie.plot}</p>}
          {movie.cast && <p className="detail__credits"><strong>Oyuncular:</strong> {movie.cast}</p>}
          {movie.director && <p className="detail__credits"><strong>Yonetmen:</strong> {movie.director}</p>}

          {watched && !watched.completed && watched.durationSecs > 0 && (
            <div className="detail__resume">
              <div className="detail__resume-bar">
                <div style={{ width: `${percent(watched.positionSecs, watched.durationSecs)}%` }} />
              </div>
              <span>%{Math.round(percent(watched.positionSecs, watched.durationSecs))} izlendi</span>
            </div>
          )}

          <div className="detail__actions">
            <button type="button" className="btn btn--primary" onClick={start}>
              {watched && !watched.completed ? '▶ Devam et' : '▶ Oynat'}
            </button>
            {watched && (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  void clearProgress(movie.id);
                  play({ url: movie.url, title: movie.name, live: false, itemId: movie.id, kind: 'movie', poster: movie.logo });
                }}
              >
                Bastan oynat
              </button>
            )}
            <button type="button" className="btn btn--ghost" onClick={() => void toggleFavorite(movie)}>
              {isFavorite(movie.id) ? '★ Favorilerden cikar' : '☆ Favorilere ekle'}
            </button>
            {movie.trailerYoutubeId && (
              <a
                className="btn btn--ghost"
                href={`https://www.youtube.com/watch?v=${movie.trailerYoutubeId}`}
                target="_blank"
                rel="noreferrer"
              >
                Fragman
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
