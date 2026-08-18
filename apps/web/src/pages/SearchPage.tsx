import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { searchCatalog } from '@appleiptv/core';
import type { MediaKind } from '@appleiptv/core';
import { useCatalog, useHiddenCategoryIds } from '../store/useApp';
import { Card, EmptyState, LazyGrid } from '../components/ui';
import { usePlayback } from '../playback/PlaybackProvider';

const KIND_LABELS: Record<MediaKind, string> = { live: 'Canli', movie: 'Film', series: 'Dizi' };

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const catalog = useCatalog();
  const hidden = useHiddenCategoryIds(catalog);
  const { play } = usePlayback();

  const query = params.get('q') ?? '';
  const [kinds, setKinds] = useState<MediaKind[]>(['live', 'movie', 'series']);

  const results = useMemo(
    () => searchCatalog(catalog, query, { kinds, hiddenCategoryIds: hidden, limit: 500 }),
    [catalog, hidden, kinds, query],
  );

  return (
    <div className="page">
      <header className="browse__toolbar">
        <input
          className="input"
          autoFocus
          placeholder="Kanal, film veya dizi ara"
          value={query}
          onChange={(event) => setParams(event.target.value ? { q: event.target.value } : {})}
        />
        <div className="chips">
          {(['live', 'movie', 'series'] as MediaKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              className={`chip ${kinds.includes(kind) ? 'is-active' : ''}`}
              onClick={() =>
                setKinds((current) =>
                  current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind],
                )
              }
            >
              {KIND_LABELS[kind]}
            </button>
          ))}
        </div>
        <span className="browse__count">{results.length} sonuc</span>
      </header>

      {query && results.length === 0 && <EmptyState title="Sonuc yok" hint="Farkli bir anahtar kelime deneyin." />}

      <LazyGrid
        items={results}
        keyOf={(item) => item.id}
        renderItem={(item) => (
          <Card
            name={item.name}
            image={item.logo}
            badge={KIND_LABELS[item.kind]}
            wide={item.kind === 'live'}
            onSelect={() => {
              if (item.kind === 'live') {
                play({ url: item.url, title: item.name, live: true, itemId: item.id, kind: 'live', poster: item.logo });
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
