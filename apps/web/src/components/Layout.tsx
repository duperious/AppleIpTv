import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useActiveProfile, useApp } from '../store/useApp';

const LINKS = [
  { to: '/', label: 'Ana Sayfa', end: true },
  { to: '/live', label: 'Canli TV' },
  { to: '/guide', label: 'Rehber' },
  { to: '/movies', label: 'Filmler' },
  { to: '/series', label: 'Diziler' },
  { to: '/favorites', label: 'Favoriler' },
];

export function Layout() {
  const navigate = useNavigate();
  const profile = useActiveProfile();
  const sync = useApp((state) => state.sync);
  const error = useApp((state) => state.error);
  const setError = useApp((state) => state.setError);
  const [query, setQuery] = useState('');

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

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand" onClick={() => navigate('/')}>
          <span className="topbar__logo">📺</span>
          <span>AppleIpTv</span>
        </div>
        <nav className="topbar__nav">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => `topbar__link ${isActive ? 'is-active' : ''}`}
            >
              {link.label}
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
          <input
            id="global-search"
            className="input"
            placeholder="Ara ( / )"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </form>
        <button type="button" className="topbar__profile" onClick={() => navigate('/profiles')}>
          <span>{profile?.avatar ?? '👤'}</span>
          <span className="topbar__profile-name">{profile?.name ?? 'Profil'}</span>
        </button>
        <NavLink to="/settings" className="topbar__link">Ayarlar</NavLink>
      </header>

      {sync && (
        <div className="banner banner--info">
          {sync.stage} {sync.total > 1 ? `(${sync.done}/${sync.total})` : ''}
        </div>
      )}
      {error && (
        <div className="banner banner--error">
          {error}
          <button type="button" className="btn btn--ghost" onClick={() => setError(undefined)}>Kapat</button>
        </div>
      )}

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
