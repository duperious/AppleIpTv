import { useSearchParams } from 'react-router-dom';
import { useApp } from '../store/useApp';

/**
 * Kenar cubugundan bir kaynak secildiginde listeler yalnizca o kaynakla
 * sinirlanir. Secim adres cubugunda `?playlist=<id>` olarak tasinir;
 * boylece baglanti paylasilabilir ve geri tusu beklenen sekilde calisir.
 */
export function usePlaylistScope(): { playlistId?: string; playlistName?: string } {
  const [params] = useSearchParams();
  const requested = params.get('playlist') ?? undefined;
  const playlist = useApp((state) => state.playlists.find((item) => item.id === requested));
  return { playlistId: playlist?.id, playlistName: playlist?.name };
}

/** Verilen kaynak secimine gore listeyi suzer. */
export function scopeToPlaylist<T extends { playlistId: string }>(
  items: readonly T[],
  playlistId?: string,
): T[] {
  return playlistId ? items.filter((item) => item.playlistId === playlistId) : [...items];
}
