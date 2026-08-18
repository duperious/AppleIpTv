import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Source } from '@appleiptv/core';
import { useApp } from '../store/useApp';
import { formatDate } from '../lib/format';
import { Spinner } from '../components/ui';

type Mode = 'xtream' | 'm3u-url' | 'm3u-file';

/** Kaynak ekleme ve yonetme ekrani (Xtream girisi veya M3U playlist). */
export function SourcesPage() {
  const navigate = useNavigate();
  const playlists = useApp((state) => state.playlists);
  const catalogs = useApp((state) => state.catalogs);
  const addPlaylist = useApp((state) => state.addPlaylist);
  const removePlaylist = useApp((state) => state.removePlaylist);
  const togglePlaylist = useApp((state) => state.togglePlaylist);
  const syncPlaylist = useApp((state) => state.syncPlaylist);
  const sync = useApp((state) => state.sync);

  const [mode, setMode] = useState<Mode>('xtream');
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [m3uUrl, setM3uUrl] = useState('');
  const [epgUrl, setEpgUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(undefined);
    try {
      let source: Source;
      let label = name.trim();

      if (mode === 'xtream') {
        source = { kind: 'xtream', host: host.trim(), username: username.trim(), password, epgUrl: epgUrl.trim() || undefined };
        label = label || new URL(/^https?:\/\//i.test(host) ? host : `http://${host}`).hostname;
      } else if (mode === 'm3u-url') {
        source = { kind: 'm3u', url: m3uUrl.trim(), epgUrl: epgUrl.trim() || undefined };
        label = label || 'M3U Playlist';
      } else {
        const file = fileRef.current?.files?.[0];
        if (!file) throw new Error('Bir .m3u dosyasi secin.');
        source = { kind: 'm3u', inlineContent: await file.text(), epgUrl: epgUrl.trim() || undefined };
        label = label || file.name.replace(/\.(m3u8?|txt)$/i, '');
      }

      await addPlaylist(label, source);
      setMessage('Kaynak eklendi.');
      setHost('');
      setUsername('');
      setPassword('');
      setM3uUrl('');
      setName('');
      navigate('/');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <h1>Kaynaklar</h1>

      <section className="card-panel">
        <div className="tabs">
          <button type="button" className={mode === 'xtream' ? 'is-active' : ''} onClick={() => setMode('xtream')}>
            Xtream Codes
          </button>
          <button type="button" className={mode === 'm3u-url' ? 'is-active' : ''} onClick={() => setMode('m3u-url')}>
            M3U adresi
          </button>
          <button type="button" className={mode === 'm3u-file' ? 'is-active' : ''} onClick={() => setMode('m3u-file')}>
            M3U dosyasi
          </button>
        </div>

        <form className="form" onSubmit={submit}>
          <label className="form__row">
            <span>Kaynak adi</span>
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ev aboneligi" />
          </label>

          {mode === 'xtream' && (
            <>
              <label className="form__row">
                <span>Sunucu adresi</span>
                <input
                  className="input"
                  value={host}
                  onChange={(event) => setHost(event.target.value)}
                  placeholder="http://sunucu.com:8080"
                  required
                />
              </label>
              <label className="form__row">
                <span>Kullanici adi</span>
                <input className="input" value={username} onChange={(event) => setUsername(event.target.value)} required />
              </label>
              <label className="form__row">
                <span>Sifre</span>
                <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
              </label>
            </>
          )}

          {mode === 'm3u-url' && (
            <label className="form__row">
              <span>M3U adresi</span>
              <input
                className="input"
                value={m3uUrl}
                onChange={(event) => setM3uUrl(event.target.value)}
                placeholder="http://sunucu.com/get.php?username=...&type=m3u_plus"
                required
              />
            </label>
          )}

          {mode === 'm3u-file' && (
            <label className="form__row">
              <span>Dosya</span>
              <input ref={fileRef} className="input" type="file" accept=".m3u,.m3u8,.txt" required />
            </label>
          )}

          <label className="form__row">
            <span>EPG adresi (istege bagli)</span>
            <input
              className="input"
              value={epgUrl}
              onChange={(event) => setEpgUrl(event.target.value)}
              placeholder="http://sunucu.com/xmltv.php?username=..."
            />
          </label>

          <div className="form__actions">
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? 'Baglaniyor...' : 'Kaynagi ekle'}
            </button>
          </div>
          {message && <p className="form__hint">{message}</p>}
          {sync && <Spinner label={`${sync.stage}`} />}
        </form>

        <p className="form__hint">
          Tarayici CORS engeline takilirsa Ayarlar &gt; Gelismis bolumunden bir proxy adresi tanimlayin.
          Apple TV uygulamasinda bu sinirlama yoktur.
        </p>
      </section>

      <section className="card-panel">
        <h2>Ekli kaynaklar</h2>
        {playlists.length === 0 && <p className="form__hint">Henuz kaynak eklenmedi.</p>}
        <ul className="list">
          {playlists.map((playlist) => {
            const catalog = catalogs[playlist.id];
            return (
              <li key={playlist.id} className="list__item">
                <div>
                  <strong>{playlist.name}</strong>
                  <div className="list__meta">
                    {playlist.source.kind === 'xtream' ? 'Xtream Codes' : 'M3U'}
                    {catalog && ` · ${catalog.live.length} kanal · ${catalog.movies.length} film · ${catalog.series.length} dizi`}
                    {playlist.lastSyncAt && ` · Son guncelleme ${formatDate(playlist.lastSyncAt)}`}
                    {playlist.expiresAt && ` · Bitis ${formatDate(playlist.expiresAt)}`}
                  </div>
                </div>
                <div className="list__actions">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={playlist.enabled}
                      onChange={(event) => void togglePlaylist(playlist.id, event.target.checked)}
                    />
                    <span>Etkin</span>
                  </label>
                  <button type="button" className="btn btn--ghost" onClick={() => void syncPlaylist(playlist.id, { force: true })}>
                    Yenile
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => {
                      if (confirm(`${playlist.name} silinsin mi?`)) void removePlaylist(playlist.id);
                    }}
                  >
                    Sil
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
