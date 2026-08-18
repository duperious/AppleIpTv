import { useCallback } from 'react';
import { programAt, upcoming } from '@appleiptv/core';
import type { EpgProgram, LiveChannel } from '@appleiptv/core';
import { useApp } from '../store/useApp';

export interface EpgLookup {
  now: (channel: LiveChannel, at?: number) => EpgProgram | undefined;
  next: (channel: LiveChannel, at?: number, count?: number) => EpgProgram[];
  /** Rehber ekrani icin belirli bir zaman araligindaki yayinlar. */
  range: (channel: LiveChannel, from: number, to: number) => EpgProgram[];
  hasData: boolean;
}

/** Kanal kayitlarini yuklu EPG verisiyle eslestiren yardimci. */
export function useEpg(): EpgLookup {
  const epg = useApp((state) => state.epg);
  const offsetMinutes = useApp(
    (state) => state.profiles.find((p) => p.id === state.activeProfileId)?.settings.epgOffsetMinutes ?? 0,
  );

  const resolve = useCallback(
    (channel: LiveChannel) => {
      const bundle = epg[channel.playlistId];
      if (!bundle) return undefined;
      const xmltvId = bundle.channelIdMap.get(channel.id) ?? channel.tvgId;
      if (!xmltvId) return undefined;
      return { bundle, xmltvId };
    },
    [epg],
  );

  const now = useCallback(
    (channel: LiveChannel, at = Date.now()) => {
      const resolved = resolve(channel);
      if (!resolved) return undefined;
      return programAt(resolved.bundle.index, resolved.xmltvId, at - offsetMinutes * 60_000);
    },
    [offsetMinutes, resolve],
  );

  const next = useCallback(
    (channel: LiveChannel, at = Date.now(), count = 4) => {
      const resolved = resolve(channel);
      if (!resolved) return [];
      return upcoming(resolved.bundle.index, resolved.xmltvId, at - offsetMinutes * 60_000, count);
    },
    [offsetMinutes, resolve],
  );

  const range = useCallback(
    (channel: LiveChannel, from: number, to: number) => {
      const resolved = resolve(channel);
      if (!resolved) return [];
      const shift = offsetMinutes * 60_000;
      const list = resolved.bundle.index.get(resolved.xmltvId) ?? [];
      return list
        .filter((program) => program.stop + shift > from && program.start + shift < to)
        .map((program) => ({ ...program, start: program.start + shift, stop: program.stop + shift }));
    },
    [offsetMinutes, resolve],
  );

  return { now, next, range, hasData: Object.keys(epg).length > 0 };
}
