import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildIndex } from '@appleiptv/core';
import type { LiveChannel, MediaItem } from '@appleiptv/core';
import { useApp, useCatalog } from '../store/useApp';
import { Card, EmptyState, LazyGrid } from '../components/ui';
import { usePlayback } from '../playback/PlaybackProvider';

export function FavoritesPage() {
  const navigate = useNavigate();
  const catalog = useCatalog();
  const favorites = useApp((state) => state.favorites);
  const { play } = usePlayback();

  const index = useMemo(() => buildIndex(catalog), [catalog]);
  const items = useMemo(
    () =>
      favorites
        .slice()
        .sort((a, b) => b.addedAt - a.addedAt)
        .map((entry) => index.byId.get(entry.itemId))
        .filter((item): item is MediaItem => Boolean(item)),
    [favorites, index],
  );
  const channels = useMemo(() => items.filter((item): item is LiveChannel => item.kind === 'live'), [items]);

  if (items.length === 0) {
    return <EmptyState title="Favori yok" hint="Kanal ve icerik kartlarindaki yildiz ile favori ekleyebilirsiniz." />;
  }

  return (
    <div className="page">
      <h1>Favoriler</h1>
      <LazyGrid
        items={items}
        keyOf={(item) => item.id}
        renderItem={(item) => (
          <Card
            name={item.name}
            image={item.logo}
            wide={item.kind === 'live'}
            onSelect={() => {
              if (item.kind === 'live') {
                play({
                  url: item.url,
                  title: item.name,
                  live: true,
                  itemId: item.id,
                  kind: 'live',
                  poster: item.logo,
                  channelRing: { channels, index: channels.findIndex((channel) => channel.id === item.id) },
                });
              } else if (item.kind === 'movie') {
                navigate(`/movies/${encodeURIComponent(item.id)}`);
              } else {
                navigate(`/series/${encodeURIComponent(item.id)}`);
              }
            }}
          />
        )}
      />
    </div>
  );
}
