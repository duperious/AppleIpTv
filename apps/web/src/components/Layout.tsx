import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useActiveProfile, useApp } from '../store/useApp';
import { FilmIcon, GuideIcon, HomeIcon, SearchIcon, SeriesIcon, SettingsIcon, StarIcon, TvIcon } from './icons';

const LINKS = [
  { to: '/', label: 'Ana Sayfa', end: true, Icon: HomeIcon },
  { to: '/live', label: 'Canli TV', Icon: TvIcon },
  { to: '/guide', label: 'Rehber', Icon: GuideIcon },
  { to: '/movies', label: 'Filmler', Icon: FilmIcon },
  { to: '/series', label: 'Diziler', Icon: SeriesIcon },
  { to: '/favorites', label: 'Favoriler', Icon: StarIcon },
];

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const profile = useActiveProfile();
  const sync = useApp((state) => state.sync);
  const error = useApp((state) => state.error);
  const setError = useApp((state) => state.setError);
  const [query, setQuery] = useState('');
  const [scrolled, setScrolled] = useState(false);

  // "/" tusu aramaya odaklanir.
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

  // Sayfa kaydirilinca ust cubuk yogunlasir.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="app">
      <header className={`topbar ${scrolled ? 'is-scrolled' : ''}`}>
        <button type="button" className="topbar__brand" onClick={() => navigate('/')}>
          <span className="topbar__logo" aria-hidden="true">
            <TvIcon size={18} />
          </span>
          <span className="topbar__wordmark">AppleIpTv</span>
        </button>

        <nav className="topbar__nav">
          {LINKS.map(({ to, label, end, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `topbar__link ${isActive ? 'is-active' : ''}`}
            >
              <Icon size={17} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <form
          className="topbar__search"
          onSubmit={(event) => {
            event.preventDefault();
            if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
          }}
        >
          <SearchIcon size={17} className="topbar__search-icon" />
          <input
            id="global-search"
            className="input input--search"
            placeholder="Ara"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd className="topbar__kbd">/</kbd>
        </form>

        <NavLink
          to="/settings"
          className={({ isActive }) => `topbar__icon-link ${isActive ? 'is-active' : ''}`}
          aria-label="Ayarlar"
        >
          <SettingsIcon size={19} />
        </NavLink>

        <button type="button" className="topbar__profile" onClick={() => navigate('/profiles')}>
          <span className="topbar__avatar">{profile?.avatar ?? '👤'}</span>
          <span className="topbar__profile-name">{profile?.name ?? 'Profil'}</span>
        </button>
      </header>

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

      <main className="content" key={location.pathname}>
        <Outlet />
      </main>
    </div>
  );
}
