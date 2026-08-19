import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { categoriesOfKind, setPin as setProfilePin, verifyPin } from '@appleiptv/core';
import type { MediaKind } from '@appleiptv/core';
import { useActiveProfile, useApp, useCatalog } from '../store/useApp';
import { idbStore } from '../store/db';
import { Diagnostics } from '../components/Diagnostics';

export function SettingsPage() {
  const navigate = useNavigate();
  const profile = useActiveProfile();
  const catalog = useCatalog();
  const settings = useApp((state) => state.settings);
  const updateAppSettings = useApp((state) => state.updateAppSettings);
  const updateSettings = useApp((state) => state.updateSettings);
  const updateProfile = useApp((state) => state.updateProfile);
  const syncAll = useApp((state) => state.syncAll);

  const [pinValue, setPinValue] = useState('');
  const [oldPin, setOldPin] = useState('');
  const [pinMessage, setPinMessage] = useState<string | undefined>();
  const [categoryKind, setCategoryKind] = useState<MediaKind>('live');
  const [testChannelId, setTestChannelId] = useState('');

  const categories = useMemo(() => categoriesOfKind(catalog, categoryKind), [catalog, categoryKind]);
  const hiddenIds = new Set(profile?.settings.hiddenCategoryIds ?? []);
  const lockedIds = new Set(profile?.settings.lockedCategoryIds ?? []);

  if (!profile) {
    return (
      <div className="page">
        <p>Once bir profil secin.</p>
        <Link className="btn btn--primary" to="/profiles">Profillere git</Link>
      </div>
    );
  }

  const toggleIn = (list: string[], id: string) =>
    list.includes(id) ? list.filter((item) => item !== id) : [...list, id];

  return (
    <div className="page settings">
      <h1>Ayarlar</h1>

      <section className="card-panel">
        <h2>Kaynaklar</h2>
        <p className="form__hint">M3U ve Xtream kaynaklarinizi ekleyip yonetin.</p>
        <div className="form__actions">
          <Link className="btn btn--primary" to="/settings/sources">Kaynaklari yonet</Link>
          <button type="button" className="btn btn--ghost" onClick={() => void syncAll({ force: true })}>
            Tumunu yenile
          </button>
        </div>
      </section>

      <section className="card-panel">
        <h2>Profil: {profile.name}</h2>
        <label className="form__row">
          <span>Acilis ekrani</span>
          <select
            className="input"
            value={profile.settings.startScreen}
            onChange={(event) => void updateSettings({ startScreen: event.target.value as 'home' })}
          >
            <option value="home">Ana Sayfa</option>
            <option value="live">Canli TV</option>
            <option value="movies">Filmler</option>
            <option value="series">Diziler</option>
          </select>
        </label>
        <label className="form__row">
          <span>Tema</span>
          <select
            className="input"
            value={profile.settings.theme}
            onChange={(event) => void updateSettings({ theme: event.target.value as 'dark' })}
          >
            <option value="dark">Koyu</option>
            <option value="midnight">Gece mavisi</option>
            <option value="light">Acik</option>
          </select>
        </label>
        <label className="form__row">
          <span>Canli yayin tamponu: {profile.settings.liveBufferSecs} sn</span>
          <input
            type="range"
            min={2}
            max={30}
            value={profile.settings.liveBufferSecs}
            onChange={(event) => void updateSettings({ liveBufferSecs: Number(event.target.value) })}
          />
        </label>
        <label className="form__row">
          <span>EPG saat kaymasi: {profile.settings.epgOffsetMinutes} dk</span>
          <input
            type="range"
            min={-720}
            max={720}
            step={30}
            value={profile.settings.epgOffsetMinutes}
            onChange={(event) => void updateSettings({ epgOffsetMinutes: Number(event.target.value) })}
          />
        </label>
        <label className="form__row form__row--inline">
          <input
            type="checkbox"
            checked={profile.kids}
            onChange={(event) => void updateProfile(profile.id, { kids: event.target.checked })}
          />
          <span>Cocuk profili (yetiskin kategorileri gizle)</span>
        </label>
      </section>

      <section className="card-panel">
        <h2>PIN</h2>
        <p className="form__hint">
          {profile.pinHash ? 'Bu profil PIN ile korunuyor.' : 'Bu profilde PIN tanimli degil.'}
        </p>
        {profile.pinHash && (
          <label className="form__row">
            <span>Mevcut PIN</span>
            <input
              className="input"
              type="password"
              inputMode="numeric"
              value={oldPin}
              onChange={(event) => setOldPin(event.target.value.replace(/\D/g, ''))}
            />
          </label>
        )}
        <label className="form__row">
          <span>Yeni PIN (bos birakip kaydederseniz kaldirilir)</span>
          <input
            className="input"
            type="password"
            inputMode="numeric"
            maxLength={8}
            value={pinValue}
            onChange={(event) => setPinValue(event.target.value.replace(/\D/g, ''))}
          />
        </label>
        <div className="form__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={async () => {
              if (profile.pinHash && !(await verifyPin(profile, oldPin))) {
                setPinMessage('Mevcut PIN hatali.');
                return;
              }
              const updated = await setProfilePin(profile, pinValue || null);
              await updateProfile(profile.id, { pinHash: updated.pinHash });
              setPinMessage(pinValue ? 'PIN guncellendi.' : 'PIN kaldirildi.');
              setPinValue('');
              setOldPin('');
            }}
          >
            Kaydet
          </button>
        </div>
        {pinMessage && <p className="form__hint">{pinMessage}</p>}
      </section>

      <section className="card-panel">
        <h2>Kategori gorunurlugu</h2>
        <div className="tabs">
          {(['live', 'movie', 'series'] as MediaKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              className={categoryKind === kind ? 'is-active' : ''}
              onClick={() => setCategoryKind(kind)}
            >
              {kind === 'live' ? 'Canli' : kind === 'movie' ? 'Film' : 'Dizi'}
            </button>
          ))}
        </div>
        <p className="form__hint">Gizlenen kategoriler hic gorunmez; kilitli kategoriler PIN ister.</p>
        <ul className="list list--compact">
          {categories.map((category) => (
            <li key={category.id} className="list__item">
              <span>{category.name}</span>
              <div className="list__actions">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={hiddenIds.has(category.id)}
                    onChange={() =>
                      void updateSettings({
                        hiddenCategoryIds: toggleIn(profile.settings.hiddenCategoryIds, category.id),
                      })
                    }
                  />
                  <span>Gizle</span>
                </label>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={lockedIds.has(category.id)}
                    onChange={() =>
                      void updateSettings({
                        lockedCategoryIds: toggleIn(profile.settings.lockedCategoryIds, category.id),
                      })
                    }
                  />
                  <span>Kilitle</span>
                </label>
              </div>
            </li>
          ))}
        </ul>
        {categories.length === 0 && <p className="form__hint">Bu turde kategori yok.</p>}
      </section>

      {catalog.live.length > 0 && (
        <section className="card-panel">
          <h2>Yayin tanilama</h2>
          <p className="form__hint">
            Canli yayin acilmiyorsa bir kanal secip test edin; hangi adimda takildigi adim adim gosterilir.
          </p>
          <label className="form__row">
            <span>Test edilecek kanal</span>
            <select
              className="input"
              value={testChannelId || catalog.live[0]!.id}
              onChange={(event) => setTestChannelId(event.target.value)}
            >
              {catalog.live.slice(0, 200).map((channel) => (
                <option key={channel.id} value={channel.id}>{channel.name}</option>
              ))}
            </select>
          </label>
          <Diagnostics
            url={(catalog.live.find((channel) => channel.id === testChannelId) ?? catalog.live[0]!).url}
            proxyUrl={settings.proxyUrl || undefined}
          />
        </section>
      )}

      <section className="card-panel">
        <h2>Gelismis</h2>
        <label className="form__row">
          <span>CORS proxy adresi</span>
          <input
            className="input"
            value={settings.proxyUrl}
            placeholder="http://localhost:8787/proxy?url="
            onChange={(event) => void updateAppSettings({ proxyUrl: event.target.value.trim() })}
          />
        </label>
        <p className="form__hint">
          Tarayici saglayiciya dogrudan erisemedigi durumda kullanilir. Depodaki <code>apps/proxy</code>
          {' '}sunucusunu <code>npm run proxy</code> ile calistirabilirsiniz.
        </p>
        <label className="form__row form__row--inline">
          <input
            type="checkbox"
            checked={settings.preferHls}
            onChange={(event) => void updateAppSettings({ preferHls: event.target.checked })}
          />
          <span>Xtream canli yayinlarda HLS (.m3u8) tercih et</span>
        </label>
        <label className="form__row">
          <span>Katalog tazeleme araligi: {settings.catalogRefreshHours} saat</span>
          <input
            type="range"
            min={1}
            max={72}
            value={settings.catalogRefreshHours}
            onChange={(event) => void updateAppSettings({ catalogRefreshHours: Number(event.target.value) })}
          />
        </label>
        <div className="form__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={async () => {
              if (!confirm('Tum yerel veriler (profiller, kaynaklar, gecmis) silinsin mi?')) return;
              await idbStore.clear();
              location.reload();
            }}
          >
            Tum verileri sil
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => navigate('/profiles')}>
            Profil degistir
          </button>
        </div>
      </section>
    </div>
  );
}
