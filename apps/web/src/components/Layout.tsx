import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useActiveProfile, useApp, useCatalog } from '../store/useApp';
import {
  FilmIcon,
  GuideIcon,
  HomeIcon,
  SearchIcon,
  SeriesIcon,
  SettingsIcon,
  StarIcon,
  TvIcon,
} from './icons';

const PRIMARY = [
  { to: '/', label: 'Ana Sayfa', end: true, Icon: HomeIcon },
  { to: '/live', label: 'Canli TV', Icon: TvIcon },
  { to: '/guide', label: 'Rehber', Icon: GuideIcon },
  { to: '/movies', label: 'Filmler', Icon: FilmIcon },
  { to: '/series', label: 'Diziler', Icon: SeriesIcon },
  { to: '/favorites', label: 'Favoriler', Icon: StarIcon },
];

/** Alt sekme cubugunda yalnizca en sik kullanilanlar yer alir. */
const MOBILE_TABS = [PRIMARY[0]!, PRIMARY[1]!, PRIMARY[2]!, PRIMARY[3]!, PRIMARY[4]!];

/**
 * Uygulama kabugu.
 *
 * Genis ekranlarda solda kalici bir kenar cubugu (bolumler + kaynaklar),
 * dar ekranlarda altta sekme cubugu kullanilir. Boylece cok sayida kaynak
 * ve medya turu, sayfa basliklarini sisirmeden gezilebilir.
 */
export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const profile = useActiveProfile();
  const catalog = useCatalog();
  const playlists = useApp((state) => state.playlists);
  const catalogs = useApp((state) => state.catalogs);
  const sync = useApp((state) => state.sync);
  const error = useApp((state) => state.error);
  const setError = useApp((state) => state.setError);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        event.preventDefault();
        document.getElementById('global-search')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** Kaynak basina, icerigi olan medya turleri. */
  const sources = useMemo(
    () =>
      playlists
        .filter((playlist) => playlist.enabled)
        .map((playlist) => {
          const source = catalogs[playlist.id];
          return {
            playlist,
            live: source?.live.length ?? 0,
            movies: source?.movies.length ?? 0,
            series: source?.series.length ?? 0,
          };
        })
        .filter((entry) => entry.live + entry.movies + entry.series > 0),
    [catalogs, playlists],
  );

  /**
   * Kaynak rozetleri yalnizca hem bolum hem de kaynak eslesince aktif olur.
   * NavLink varsayilan olarak sorgu parametresini yok saydigi icin bunu
   * elle hesapliyoruz.
   */
  const activeScope = new URLSearchParams(location.search).get('playlist');
  const chipClass = (path: string, id: string) =>
    `sidebar__chip ${location.pathname === path && activeScope === id ? 'is-active' : ''}`;

  const totals = {
    live: catalog.live.length,
    movies: catalog.movies.length,
    series: catalog.series.length,
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <button type="button" className="sidebar__brand" onClick={() => navigate('/')}>
          <span className="sidebar__logo" aria-hidden="true">
            <TvIcon size={18} />
          </span>
          <span>AppleIpTv</span>
        </button>

        <form
          className="sidebar__search"
          onSubmit={(event) => {
            event.preventDefault();
            if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
          }}
        >
          <SearchIcon size={16} />
          <input
            id="global-search"
            className="input input--bare"
            placeholder="Ara"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd>/</kbd>
        </form>

        <nav className="sidebar__nav">
          {PRIMARY.map(({ to, label, end, Icon }) => {
            const count =
              to === '/live' ? totals.live : to === '/movies' ? totals.movies : to === '/series' ? totals.series : undefined;
            return (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => `sidebar__link ${isActive ? 'is-active' : ''}`}>
                <Icon size={17} />
                <span className="sidebar__label">{label}</span>
                {count ? <span className="sidebar__count">{count > 999 ? `${Math.round(count / 1000)}b` : count}</span> : null}
              </NavLink>
            );
          })}
        </nav>

        {sources.length > 0 && (
          <div className="sidebar__section">
            <span className="sidebar__section-title">Kaynaklar</span>
            {sources.map(({ playlist, live, movies, series }) => (
              <div key={playlist.id} className="sidebar__source">
                <span className="sidebar__source-name" title={playlist.name}>{playlist.name}</span>
                <div className="sidebar__source-links">
                  {live > 0 && (
                    <NavLink to={`/live?playlist=${encodeURIComponent(playlist.id)}`} className={chipClass('/live', playlist.id)}>
                      <TvIcon size={13} /> {live}
                    </NavLink>
                  )}
                  {movies > 0 && (
                    <NavLink to={`/movies?playlist=${encodeURIComponent(playlist.id)}`} className={chipClass('/movies', playlist.id)}>
                      <FilmIcon size={13} /> {movies}
                    </NavLink>
                  )}
                  {series > 0 && (
                    <NavLink to={`/series?playlist=${encodeURIComponent(playlist.id)}`} className={chipClass('/series', playlist.id)}>
                      <SeriesIcon size={13} /> {series}
                    </NavLink>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="sidebar__footer">
          <button type="button" className="sidebar__profile" onClick={() => navigate('/profiles')}>
            <span className="sidebar__avatar">{profile?.avatar ?? '👤'}</span>
            <span className="sidebar__label">{profile?.name ?? 'Profil'}</span>
          </button>
          <NavLink
            to="/settings"
            className={({ isActive }) => `sidebar__icon-link ${isActive ? 'is-active' : ''}`}
            aria-label="Ayarlar"
          >
            <SettingsIcon size={18} />
          </NavLink>
        </div>
      </aside>

      <div className="toasts">
        {sync && (
          <div className="toast toast--info">
            <span className="toast__spinner" />
            {sync.stage}
            {sync.total > 1 ? ` (${sync.done}/${sync.total})` : ''}
          </div>
        )}
        {error && (
          <div className="toast toast--error">
            <span>{error}</span>
            <button type="button" className="toast__close" onClick={() => setError(undefined)} aria-label="Kapat">
              ✕
            </button>
          </div>
        )}
      </div>

      <main className="content" key={location.pathname + location.search}>
        <Outlet />
      </main>

      <nav className="tabbar">
        {MOBILE_TABS.map(({ to, label, end, Icon }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `tabbar__link ${isActive ? 'is-active' : ''}`}>
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
        <NavLink to="/search" className={({ isActive }) => `tabbar__link ${isActive ? 'is-active' : ''}`}>
          <SearchIcon size={20} />
          <span>Ara</span>
        </NavLink>
      </nav>
    </div>
  );
}
