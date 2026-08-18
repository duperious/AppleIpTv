import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { categoriesOfKind, itemsInCategory, normalizeText } from '@appleiptv/core';
import type { MediaKind, MovieItem, SeriesItem } from '@appleiptv/core';
import { useCatalog, useHiddenCategoryIds, useCatalogIndex } from '../store/useApp';
import { Card, EmptyState, LazyGrid } from '../components/ui';

type Sortable = MovieItem | SeriesItem;
type SortMode = 'default' | 'name' | 'year' | 'rating';

/** Film ve dizi listeleri icin ortak gozatma ekrani. */
export function BrowsePage({ kind }: { kind: Exclude<MediaKind, 'live'> }) {
  const navigate = useNavigate();
  const catalog = useCatalog();
  const hidden = useHiddenCategoryIds(catalog);
  const index = useCatalogIndex(catalog);

  const [categoryId, setCategoryId] = useState('');
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<SortMode>('default');

  const categories = useMemo(
    () => categoriesOfKind(catalog, kind, { hiddenCategoryIds: hidden }),
    [catalog, hidden, kind],
  );

  const items = useMemo(() => {
    const pool: Sortable[] = categoryId
      ? (itemsInCategory(catalog, index, categoryId) as Sortable[])
      : ((kind === 'movie' ? catalog.movies : catalog.series) as Sortable[]);

    let list = pool.filter((item) => !item.categoryIds.some((id) => hidden.has(id)));
    const needle = normalizeText(filter);
    if (needle) list = list.filter((item) => item.searchKey.includes(needle));

    const sorted = [...list];
    switch (sort) {
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
        break;
      case 'year':
        sorted.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
        break;
      case 'rating':
        sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
        break;
      default:
        sorted.sort((a, b) => a.order - b.order);
    }
    return sorted;
  }, [catalog, categoryId, filter, hidden, index, kind, sort]);

  const title = kind === 'movie' ? 'Filmler' : 'Diziler';

  if ((kind === 'movie' ? catalog.movies : catalog.series).length === 0) {
    return <EmptyState title={`${title} bulunamadi`} hint="Kaynaginizda bu tur icerik olmayabilir." />;
  }

  return (
    <div className="page">
      <header className="browse__toolbar">
        <h1>{title}</h1>
        <select className="input" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          <option value="">Tum kategoriler</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
        <select className="input" value={sort} onChange={(event) => setSort(event.target.value as SortMode)}>
          <option value="default">Varsayilan sira</option>
          <option value="name">Ada gore</option>
          <option value="year">Yila gore</option>
          <option value="rating">Puana gore</option>
        </select>
        <input
          className="input"
          placeholder="Baslikta ara"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <span className="browse__count">{items.length} kayit</span>
      </header>

      <LazyGrid
        items={items}
        keyOf={(item) => item.id}
        renderItem={(item) => (
          <Card
            name={item.name}
            image={item.logo}
            meta={[item.year, item.rating ? `★ ${item.rating}` : undefined].filter(Boolean).join(' · ')}
            onSelect={() => navigate(`/${kind === 'movie' ? 'movies' : 'series'}/${encodeURIComponent(item.id)}`)}
          />
        )}
      />
    </div>
  );
}
