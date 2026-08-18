import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { colorFromName } from '../lib/format';

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner" role="status">
      <div className="spinner__ring" />
      {label && <span>{label}</span>}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
      {action}
    </div>
  );
}

/** Poster/logo; gorsel yoksa isimden uretilen renkli bir zemin gosterir. */
export function Poster({ src, name, wide = false }: { src?: string; name: string; wide?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return (
      <div className={`poster poster--fallback ${wide ? 'poster--wide' : ''}`} style={{ background: colorFromName(name) }}>
        <span>{name.slice(0, 24)}</span>
      </div>
    );
  }
  return (
    <img
      className={`poster ${wide ? 'poster--wide' : ''}`}
      src={src}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export interface CardProps {
  name: string;
  image?: string;
  meta?: string;
  badge?: string;
  progressPercent?: number;
  wide?: boolean;
  onSelect: () => void;
  onLongPress?: () => void;
}

export function Card({ name, image, meta, badge, progressPercent, wide, onSelect, onLongPress }: CardProps) {
  return (
    <button
      type="button"
      className={`card ${wide ? 'card--wide' : ''}`}
      onClick={onSelect}
      onContextMenu={(event) => {
        if (!onLongPress) return;
        event.preventDefault();
        onLongPress();
      }}
    >
      <div className="card__art">
        <Poster src={image} name={name} wide={wide} />
        {badge && <span className="card__badge">{badge}</span>}
        {progressPercent !== undefined && progressPercent > 0 && (
          <div className="card__progress">
            <div style={{ width: `${progressPercent}%` }} />
          </div>
        )}
      </div>
      <div className="card__label">
        <span className="card__name">{name}</span>
        {meta && <span className="card__meta">{meta}</span>}
      </div>
    </button>
  );
}

export function Rail({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rail">
      <header className="rail__header">
        <h2>{title}</h2>
        {action}
      </header>
      <div className="rail__track">{children}</div>
    </section>
  );
}

/**
 * Cok buyuk listeleri (on binlerce kayit) akici tutmak icin
 * gorunur alana yaklasildikca parca parca cizen izgara.
 */
export function LazyGrid<T>({
  items,
  renderItem,
  pageSize = 60,
  keyOf,
}: {
  items: readonly T[];
  renderItem: (item: T) => ReactNode;
  pageSize?: number;
  keyOf: (item: T) => string;
}) {
  const [visible, setVisible] = useState(pageSize);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => setVisible(pageSize), [items, pageSize]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible((current) => Math.min(items.length, current + pageSize));
      }
    }, { rootMargin: '600px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [items.length, pageSize]);

  return (
    <>
      <div className="grid">
        {items.slice(0, visible).map((item) => (
          <div key={keyOf(item)}>{renderItem(item)}</div>
        ))}
      </div>
      {visible < items.length && <div ref={sentinel} className="grid__sentinel">Yukleniyor...</div>}
    </>
  );
}

export function PinDialog({
  title,
  onSubmit,
  onCancel,
}: {
  title: string;
  onSubmit: (pin: string) => Promise<boolean> | boolean;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <form
        className="modal__box"
        onSubmit={async (event) => {
          event.preventDefault();
          const ok = await onSubmit(pin);
          if (!ok) {
            setError('PIN hatali.');
            setPin('');
          }
        }}
      >
        <h3>{title}</h3>
        <input
          ref={inputRef}
          className="input input--pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          value={pin}
          onChange={(event) => {
            setPin(event.target.value.replace(/\D/g, ''));
            setError(undefined);
          }}
          placeholder="••••"
        />
        {error && <p className="form__error">{error}</p>}
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>Vazgec</button>
          <button type="submit" className="btn btn--primary">Onayla</button>
        </div>
      </form>
    </div>
  );
}
