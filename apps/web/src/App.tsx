import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PlaybackProvider } from './playback/PlaybackProvider';
import { Spinner } from './components/ui';
import { useActiveProfile, useApp } from './store/useApp';
import { HomePage } from './pages/HomePage';
import { LivePage } from './pages/LivePage';
import { GuidePage } from './pages/GuidePage';
import { BrowsePage } from './pages/BrowsePage';
import { MovieDetailPage } from './pages/MovieDetailPage';
import { SeriesDetailPage } from './pages/SeriesDetailPage';
import { SearchPage } from './pages/SearchPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { SettingsPage } from './pages/SettingsPage';
import { SourcesPage } from './pages/SourcesPage';
import { ProfilesPage } from './pages/ProfilesPage';

export function App() {
  const ready = useApp((state) => state.ready);
  const init = useApp((state) => state.init);
  const syncAll = useApp((state) => state.syncAll);
  const activeProfileId = useApp((state) => state.activeProfileId);
  const profile = useActiveProfile();

  useEffect(() => {
    void init();
  }, [init]);

  // Acilista eskimis kataloglari arka planda tazele.
  useEffect(() => {
    if (ready && activeProfileId) void syncAll();
  }, [ready, activeProfileId, syncAll]);

  useEffect(() => {
    document.documentElement.dataset['theme'] = profile?.settings.theme ?? 'dark';
  }, [profile?.settings.theme]);

  if (!ready) return <Spinner label="Yukleniyor..." />;

  return (
    <PlaybackProvider>
      <Routes>
        <Route path="/profiles" element={<ProfilesPage />} />
        <Route element={<RequireProfile />}>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="live" element={<LivePage />} />
            <Route path="guide" element={<GuidePage />} />
            <Route path="movies" element={<BrowsePage kind="movie" />} />
            <Route path="movies/:id" element={<MovieDetailPage />} />
            <Route path="series" element={<BrowsePage kind="series" />} />
            <Route path="series/:id" element={<SeriesDetailPage />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="favorites" element={<FavoritesPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="settings/sources" element={<SourcesPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </PlaybackProvider>
  );
}

/** Profil secilmeden uygulamaya girilmesini engeller. */
function RequireProfile() {
  const activeProfileId = useApp((state) => state.activeProfileId);
  const navigate = useNavigate();
  useEffect(() => {
    if (!activeProfileId) navigate('/profiles', { replace: true });
  }, [activeProfileId, navigate]);
  if (!activeProfileId) return null;
  return <Outlet />;
}
