import { useMemo, useState } from 'react';
import { categoriesOfKind, itemsInCategory, normalizeText, verifyPin } from '@appleiptv/core';
import type { LiveChannel } from '@appleiptv/core';
import { useActiveProfile, useApp, useCatalog, useHiddenCategoryIds, useCatalogIndex } from '../store/useApp';
import { EmptyState, LiveProgress, PinDialog, Poster } from '../components/ui';
import { LockIcon, PlayIcon, SearchIcon, StarIcon } from '../components/icons';
import { usePlayback } from '../playback/PlaybackProvider';
import { useEpg } from '../hooks/useEpg';
import { formatClock } from '../lib/format';

const ALL = '__all__';
const FAVORITES = '__fav__';

/** Canli TV: kategori listesi + kanal listesi + secili kanalin EPG onizlemesi. */
export function LivePage() {
  const catalog = useCatalog();
  const hidden = useHiddenCategoryIds(catalog);
  const profile = useActiveProfile();
  const favorites = useApp((state) => state.favorites);
  const toggleFavorite = useApp((state) => state.toggleFavorite);
  const unlocked = useApp((state) => state.unlockedCategoryIds);
  const unlockCategory = useApp((state) => state.unlockCategory);
  const { play } = usePlayback();
  const epg = useEpg();

  const [categoryId, setCategoryId] = useState<string>(ALL);
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [pendingLock, setPendingLock] = useState<string | undefined>();

  const index = useCatalogIndex(catalog);
  const categories = useMemo(
    () => categoriesOfKind(catalog, 'live', { hiddenCategoryIds: hidden }),
    [catalog, hidden],
  );
  const lockedIds = useMemo(
    () => new Set((profile?.settings.lockedCategoryIds ?? []).filter((id) => !unlocked.includes(id))),
    [profile, unlocked],
  );

  const channels = useMemo(() => {
    let list: LiveChannel[];
    if (categoryId === ALL) {
      list = catalog.live.filter((channel) => !channel.categoryIds.some((id) => hidden.has(id) || lockedIds.has(id)));
    } else if (categoryId === FAVORITES) {
      const ids = new Set(favorites.filter((entry) => entry.kind === 'live').map((entry) => entry.itemId));
      list = catalog.live.filter((channel) => ids.has(channel.id));
    } else {
      list = itemsInCategory(catalog, index, categoryId).filter(
        (item): item is LiveChannel => item.kind === 'live',
      );
    }
    const needle = normalizeText(filter);
    if (needle) list = list.filter((channel) => channel.searchKey.includes(needle));
    return list;
  }, [catalog, categoryId, favorites, filter, hidden, index, lockedIds]);

  const selected = useMemo(
    () => channels.find((channel) => channel.id === selectedId) ?? channels[0],
    [channels, selectedId],
  );
  const nowProgram = selected ? epg.now(selected) : undefined;
  const nextPrograms = selected ? epg.next(selected, Date.now(), 5) : [];

  const openCategory = (id: string) => {
    if (lockedIds.has(id)) {
      setPendingLock(id);
      return;
    }
    setCategoryId(id);
    setSelectedId(undefined);
  };

  if (catalog.live.length === 0) {
    return <EmptyState title="Canli kanal bulunamadi" hint="Kaynagi yenilemeyi deneyin." />;
  }

  return (
    <div className="live">
      <aside className="live__categories">
        <span className="live__categories-title">Kategoriler</span>
        <button type="button" className={categoryId === ALL ? 'is-active' : ''} onClick={() => openCategory(ALL)}>
          <span className="live__category-name">Tum kanallar</span>
          <span className="live__category-count">{catalog.live.length}</span>
        </button>
        <button type="button" className={categoryId === FAVORITES ? 'is-active' : ''} onClick={() => openCategory(FAVORITES)}>
          <span className="live__category-name">Favoriler</span>
          <span className="live__category-count">{favorites.filter((entry) => entry.kind === 'live').length}</span>
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            className={categoryId === category.id ? 'is-active' : ''}
            onClick={() => openCategory(category.id)}
          >
            <span className="live__category-name">{category.name}</span>
            <span className="live__category-count">
              {lockedIds.has(category.id) ? <LockIcon size={14} /> : (index.itemsByCategory.get(category.id)?.length ?? 0)}
            </span>
          </button>
        ))}
      </aside>

      <section className="live__list">
        <label className="live__filter">
          <SearchIcon size={17} />
          <input
            className="input input--bare"
            placeholder="Kanal ara"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>
        <ul>
          {channels.map((channel, position) => {
            const program = epg.now(channel);
            const isFav = favorites.some((entry) => entry.itemId === channel.id);
            return (
              <li key={channel.id} className={channel.id === selected?.id ? 'is-selected' : ''}>
                <button
                  type="button"
                  className="channel"
                  onClick={() => setSelectedId(channel.id)}
                  onDoubleClick={() =>
                    play({
                      url: channel.url,
                      title: channel.name,
                      subtitle: program?.title,
                      live: true,
                      itemId: channel.id,
                      kind: 'live',
                      poster: channel.logo,
                      channelRing: { channels, index: position },
                    })
                  }
                >
                  <div className="channel__logo">
                    <Poster src={channel.logo} name={channel.name} wide />
                  </div>
                  <div className="channel__text">
                    <strong>
                      {channel.channelNumber ? <span className="channel__number">{channel.channelNumber}</span> : null}
                      {channel.name}
                    </strong>
                    {program ? (
                      <>
                        <span className="channel__now">
                          <span className="channel__time">{formatClock(program.start)}</span>
                          {program.title}
                        </span>
                        <LiveProgress start={program.start} stop={program.stop} />
                      </>
                    ) : (
                      <span className="channel__now channel__now--empty">Rehber bilgisi yok</span>
                    )}
                  </div>
                  <span className="channel__play" aria-hidden="true">
                    <PlayIcon size={16} />
                  </span>
                </button>
                <button
                  type="button"
                  className={`channel__fav ${isFav ? 'is-active' : ''}`}
                  aria-label="Favori"
                  onClick={() => void toggleFavorite(channel)}
                >
                  <StarIcon size={18} filled={isFav} />
                </button>
              </li>
            );
          })}
        </ul>
        {channels.length === 0 && <p className="form__hint">Bu filtreye uyan kanal yok.</p>}
      </section>

      <section className="live__detail">
        {selected ? (
          <>
            <div className="live__hero">
              <Poster src={selected.logo} name={selected.name} wide />
            </div>
            <h2>{selected.name}</h2>
            {nowProgram ? (
              <div className="live__program">
                <strong>{nowProgram.title}</strong>
                <span>
                  {formatClock(nowProgram.start)} - {formatClock(nowProgram.stop)}
                </span>
                <LiveProgress start={nowProgram.start} stop={nowProgram.stop} />
                {nowProgram.description && <p>{nowProgram.description}</p>}
              </div>
            ) : (
              <p className="form__hint">Bu kanal icin EPG bilgisi yok.</p>
            )}

            <button
              type="button"
              className="btn btn--primary btn--block"
              onClick={() =>
                play({
                  url: selected.url,
                  title: selected.name,
                  subtitle: nowProgram?.title,
                  live: true,
                  itemId: selected.id,
                  kind: 'live',
                  poster: selected.logo,
                  channelRing: { channels, index: channels.findIndex((c) => c.id === selected.id) },
                })
              }
            >
              <PlayIcon size={18} /> Izle
            </button>

            {nextPrograms.length > 1 && (
              <div className="live__upcoming">
                <h3>Sirada</h3>
                <ul>
                  {nextPrograms.slice(1).map((program) => (
                    <li key={`${program.channelId}-${program.start}`}>
                      <span>{formatClock(program.start)}</span>
                      <strong>{program.title}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="form__hint">Soldan bir kanal secin.</p>
        )}
      </section>

      {pendingLock && (
        <PinDialog
          title="Kilitli kategori"
          onCancel={() => setPendingLock(undefined)}
          onSubmit={async (pin) => {
            if (!profile) return false;
            const ok = await verifyPin(profile, pin);
            if (ok) {
              unlockCategory(pendingLock);
              setCategoryId(pendingLock);
              setPendingLock(undefined);
            }
            return ok;
          }}
        />
      )}
    </div>
  );
}
