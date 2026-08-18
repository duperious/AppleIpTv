import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { LiveChannel, MediaKind } from '@appleiptv/core';
import { MediaPlayer } from '../player/MediaPlayer';
import { useActiveProfile, useApp } from '../store/useApp';

export interface PlayRequest {
  url: string;
  title: string;
  subtitle?: string;
  live: boolean;
  itemId: string;
  kind: MediaKind;
  episodeId?: string;
  poster?: string;
  startPositionSecs?: number;
  /** Canli yayinda yukari/asagi ile kanal gezinmek icin siradaki kanallar. */
  channelRing?: { channels: LiveChannel[]; index: number };
  /** Dizilerde siradaki bolum. */
  next?: PlayRequest;
}

interface PlaybackContextValue {
  play: (request: PlayRequest) => void;
  stop: () => void;
  current?: PlayRequest;
}

const PlaybackContext = createContext<PlaybackContextValue | null>(null);

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<PlayRequest | undefined>();
  const saveProgress = useApp((state) => state.saveProgress);
  const pushRecentChannel = useApp((state) => state.pushRecentChannel);
  const profile = useActiveProfile();

  const play = useCallback(
    (request: PlayRequest) => {
      setCurrent(request);
      if (request.kind === 'live') void pushRecentChannel(request.itemId);
    },
    [pushRecentChannel],
  );

  const stop = useCallback(() => setCurrent(undefined), []);

  const stepChannel = useCallback(
    (direction: 1 | -1) => {
      setCurrent((request) => {
        if (!request?.channelRing) return request;
        const { channels, index } = request.channelRing;
        if (channels.length === 0) return request;
        const nextIndex = (index + direction + channels.length) % channels.length;
        const channel = channels[nextIndex]!;
        void pushRecentChannel(channel.id);
        return {
          ...request,
          url: channel.url,
          title: channel.name,
          itemId: channel.id,
          poster: channel.logo,
          channelRing: { channels, index: nextIndex },
        };
      });
    },
    [pushRecentChannel],
  );

  const value = useMemo<PlaybackContextValue>(() => ({ play, stop, current }), [play, stop, current]);

  return (
    <PlaybackContext.Provider value={value}>
      {children}
      {current && (
        <MediaPlayer
          key={current.url}
          url={current.url}
          title={current.title}
          subtitle={current.subtitle}
          live={current.live}
          liveBufferSecs={profile?.settings.liveBufferSecs ?? 6}
          startPositionSecs={current.startPositionSecs}
          onClose={stop}
          onChannelStep={current.channelRing ? stepChannel : undefined}
          onNext={current.next ? () => setCurrent(current.next) : undefined}
          onProgress={(position, duration) => {
            if (current.live) return;
            void saveProgress({
              itemId: current.itemId,
              kind: current.kind,
              episodeId: current.episodeId,
              positionSecs: position,
              durationSecs: duration,
              title: current.title,
              poster: current.poster,
            });
          }}
        />
      )}
    </PlaybackContext.Provider>
  );
}

export function usePlayback(): PlaybackContextValue {
  const context = useContext(PlaybackContext);
  if (!context) throw new Error('usePlayback yalnizca PlaybackProvider icinde kullanilabilir.');
  return context;
}
