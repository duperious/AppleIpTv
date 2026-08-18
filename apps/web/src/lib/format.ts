/** Arayuzde kullanilan bicimlendirme yardimcilari. */

export function formatClock(ms: number, offsetMinutes = 0): string {
  return new Date(ms + offsetMinutes * 60_000).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatRuntime(secs?: number): string {
  if (!secs || secs <= 0) return '';
  const hours = Math.floor(secs / 3600);
  const mins = Math.round((secs % 3600) / 60);
  return hours > 0 ? `${hours} sa ${mins} dk` : `${mins} dk`;
}

export function formatPosition(secs: number): string {
  const total = Math.max(0, Math.floor(secs));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function percent(position: number, duration: number): number {
  if (!duration) return 0;
  return Math.min(100, Math.max(0, (position / duration) * 100));
}

/** Bos poster yerine kullanilacak, isimden uretilmis renkli arka plan. */
export function colorFromName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `linear-gradient(140deg, hsl(${hue} 45% 26%), hsl(${(hue + 40) % 360} 40% 14%))`;
}
