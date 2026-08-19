import { useMemo, useState } from 'react';
import { categoriesOfKind, itemsInCategory } from '@appleiptv/core';
import type { LiveChannel } from '@appleiptv/core';
import { useCatalog, useHiddenCategoryIds, useCatalogIndex } from '../store/useApp';
import { EmptyState } from '../components/ui';
import { useEpg } from '../hooks/useEpg';
import { formatClock } from '../lib/format';
import { usePlayback } from '../playback/PlaybackProvider';

const HOUR = 3600_000;
const PIXELS_PER_HOUR = 240;
const WINDOW_HOURS = 6;
const MAX_ROWS = 80;

/** Zaman cizelgeli TV rehberi. */
export function GuidePage() {
  const catalog = useCatalog();
  const hidden = useHiddenCategoryIds(catalog);
  const epg = useEpg();
  const { play } = usePlayback();

  const index = useCatalogIndex(catalog);
  const categories = useMemo(
    () => categoriesOfKind(catalog, 'live', { hiddenCategoryIds: hidden }),
    [catalog, hidden],
  );
  const [categoryId, setCategoryId] = useState<string>('');
  const [offsetHours, setOffsetHours] = useState(0);

  const start = useMemo(() => {
    const base = new Date();
    base.setMinutes(0, 0, 0);
    return base.getTime() + offsetHours * HOUR;
  }, [offsetHours]);
  const end = start + WINDOW_HOURS * HOUR;

  const channels = useMemo(() => {
    const list = categoryId
      ? itemsInCategory(catalog, index, categoryId).filter((item): item is LiveChannel => item.kind === 'live')
      : catalog.live.filter((channel) => !channel.categoryIds.some((id) => hidden.has(id)));
    return list.slice(0, MAX_ROWS);
  }, [catalog, categoryId, hidden, index]);

  const hourMarks = useMemo(
    () => Array.from({ length: WINDOW_HOURS }, (_unused, i) => start + i * HOUR),
    [start],
  );

  /** Su anki zaman gorunen pencerede ise dikey bir cizgi ile isaretlenir. */
  const nowOffset = useMemo(() => {
    const now = Date.now();
    if (now < start || now > end) return undefined;
    return ((now - start) / HOUR) * PIXELS_PER_HOUR;
  }, [end, start]);

  if (!epg.hasData) {
    return (
      <EmptyState
        title="EPG verisi yok"
        hint="Kaynaginizda XMLTV adresi tanimliysa yenileyin; Xtream hesaplarinda EPG otomatik indirilir."
      />
    );
  }

  return (
    <div className="page guide">
      <header className="guide__toolbar">
        <select className="input" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          <option value="">Tum kanallar (ilk {MAX_ROWS})</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
        <div className="guide__nav">
          <button type="button" className="btn btn--ghost" onClick={() => setOffsetHours((h) => h - 2)}>◀ 2 sa</button>
          <button type="button" className="btn btn--ghost" onClick={() => setOffsetHours(0)}>Simdi</button>
          <button type="button" className="btn btn--ghost" onClick={() => setOffsetHours((h) => h + 2)}>2 sa ▶</button>
        </div>
      </header>

      <div className="guide__scroll">
        <div className="guide__grid" style={{ width: PIXELS_PER_HOUR * WINDOW_HOURS + 220 }}>
          {nowOffset !== undefined && (
            <div className="guide__now" style={{ left: 220 + nowOffset }} aria-hidden="true">
              <span className="guide__now-dot" />
            </div>
          )}
          <div className="guide__row guide__row--head">
            <div className="guide__channel" />
            <div className="guide__timeline">
              {hourMarks.map((mark, index) => (
                <div
                  key={mark}
                  className="guide__hour"
                  style={{ width: PIXELS_PER_HOUR, left: index * PIXELS_PER_HOUR }}
                >
                  {formatClock(mark)}
                </div>
              ))}
            </div>
          </div>

          {channels.map((channel) => {
            const programs = epg.range(channel, start, end);
            return (
              <div key={channel.id} className="guide__row">
                <div className="guide__channel">{channel.name}</div>
                <div className="guide__timeline">
                  {programs.length === 0 && <div className="guide__empty">Bilgi yok</div>}
                  {programs.map((program) => {
                    const left = ((Math.max(program.start, start) - start) / HOUR) * PIXELS_PER_HOUR;
                    const width = ((Math.min(program.stop, end) - Math.max(program.start, start)) / HOUR) * PIXELS_PER_HOUR;
                    const isNow = program.start <= Date.now() && program.stop > Date.now();
                    return (
                      <button
                        key={`${program.channelId}-${program.start}`}
                        type="button"
                        className={`guide__program ${isNow ? 'is-now' : ''}`}
                        style={{ left, width: Math.max(width - 4, 24) }}
                        title={`${formatClock(program.start)} - ${formatClock(program.stop)}  ${program.title}`}
                        onClick={() =>
                          play({
                            url: channel.url,
                            title: channel.name,
                            subtitle: program.title,
                            live: true,
                            itemId: channel.id,
                            kind: 'live',
                            poster: channel.logo,
                            channelRing: { channels, index: channels.findIndex((c) => c.id === channel.id) },
                          })
                        }
                      >
                        <span>{program.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
