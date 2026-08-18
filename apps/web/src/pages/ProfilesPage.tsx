import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AVATARS, verifyPin } from '@appleiptv/core';
import type { Profile } from '@appleiptv/core';
import { useApp } from '../store/useApp';
import { PinDialog } from '../components/ui';

export function ProfilesPage() {
  const navigate = useNavigate();
  const profiles = useApp((state) => state.profiles);
  const playlists = useApp((state) => state.playlists);
  const addProfile = useApp((state) => state.addProfile);
  const selectProfile = useApp((state) => state.selectProfile);
  const removeProfile = useApp((state) => state.removeProfile);

  const [creating, setCreating] = useState(profiles.length === 0);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]!);
  const [kids, setKids] = useState(false);
  const [pin, setPin] = useState('');
  const [pendingProfile, setPendingProfile] = useState<Profile | undefined>();

  const enter = async (profile: Profile) => {
    if (profile.pinHash) {
      setPendingProfile(profile);
      return;
    }
    await selectProfile(profile.id);
    navigate(playlists.length === 0 ? '/settings/sources' : '/');
  };

  return (
    <div className="profiles">
      <h1>Kim izliyor?</h1>
      <div className="profiles__list">
        {profiles.map((profile) => (
          <div key={profile.id} className="profiles__item">
            <button type="button" className="profiles__avatar" onClick={() => void enter(profile)}>
              <span>{profile.avatar}</span>
            </button>
            <strong>{profile.name}</strong>
            <span className="profiles__tags">
              {profile.kids && <span className="badge">Cocuk</span>}
              {profile.pinHash && <span className="badge">🔒</span>}
            </span>
            {profiles.length > 1 && (
              <button
                type="button"
                className="btn btn--ghost btn--tiny"
                onClick={() => {
                  if (confirm(`${profile.name} profili silinsin mi?`)) void removeProfile(profile.id);
                }}
              >
                Sil
              </button>
            )}
          </div>
        ))}

        {!creating && (
          <div className="profiles__item">
            <button type="button" className="profiles__avatar profiles__avatar--add" onClick={() => setCreating(true)}>
              <span>+</span>
            </button>
            <strong>Profil ekle</strong>
          </div>
        )}
      </div>

      {creating && (
        <form
          className="form card-panel"
          onSubmit={async (event) => {
            event.preventDefault();
            const profile = await addProfile({ name, avatar, kids, pin: pin || undefined });
            setCreating(false);
            setName('');
            setPin('');
            await selectProfile(profile.id);
            navigate(playlists.length === 0 ? '/settings/sources' : '/');
          }}
        >
          <h2>Yeni profil</h2>
          <label className="form__row">
            <span>Ad</span>
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} required maxLength={24} />
          </label>
          <div className="form__row">
            <span>Avatar</span>
            <div className="avatar-picker">
              {AVATARS.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={`avatar-picker__item ${avatar === item ? 'is-active' : ''}`}
                  onClick={() => setAvatar(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <label className="form__row form__row--inline">
            <input type="checkbox" checked={kids} onChange={(event) => setKids(event.target.checked)} />
            <span>Cocuk profili (yetiskin kategoriler gizlenir)</span>
          </label>
          <label className="form__row">
            <span>PIN (istege bagli)</span>
            <input
              className="input"
              type="password"
              inputMode="numeric"
              maxLength={8}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
              placeholder="4 haneli"
            />
          </label>
          <div className="form__actions">
            {profiles.length > 0 && (
              <button type="button" className="btn btn--ghost" onClick={() => setCreating(false)}>Vazgec</button>
            )}
            <button type="submit" className="btn btn--primary">Olustur</button>
          </div>
        </form>
      )}

      {pendingProfile && (
        <PinDialog
          title={`${pendingProfile.name} icin PIN`}
          onCancel={() => setPendingProfile(undefined)}
          onSubmit={async (value) => {
            const ok = await verifyPin(pendingProfile, value);
            if (ok) {
              await selectProfile(pendingProfile.id);
              setPendingProfile(undefined);
              navigate(playlists.length === 0 ? '/settings/sources' : '/');
            }
            return ok;
          }}
        />
      )}
    </div>
  );
}
