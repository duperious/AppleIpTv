import Hls from 'hls.js';
import mpegts from 'mpegts.js';

export type EngineKind = 'native' | 'hls' | 'mpegts';

export interface EngineHandle {
  kind: EngineKind;
  destroy: () => void;
  /** Canli yayinlarda cok geride kalindiginda tekrar cana yaklastirir. */
  seekToLive?: () => void;
  /** hls.js kalite seviyeleri. */
  levels?: () => { index: number; label: string }[];
  setLevel?: (index: number) => void;
}

export interface EngineOptions {
  url: string;
  live: boolean;
  liveBufferSecs: number;
  onError: (message: string, fatal: boolean) => void;
  onReady?: () => void;
}

/** Adresin uzantisina ve icerik turune gore hangi motorun gerektigini belirler. */
export function detectEngine(url: string): EngineKind {
  const path = url.split('?')[0]!.toLowerCase();
  if (path.endsWith('.m3u8')) {
    // Safari (ve iOS/tvOS WebKit) HLS'i yerel olarak oynatir.
    const video = document.createElement('video');
    if (video.canPlayType('application/vnd.apple.mpegurl')) return 'native';
    return Hls.isSupported() ? 'hls' : 'native';
  }
  if (path.endsWith('.ts') || path.endsWith('.mpegts') || path.endsWith('.flv')) {
    return mpegts.isSupported() ? 'mpegts' : 'native';
  }
  return 'native';
}

/**
 * Video etiketini uygun motora baglar. Donen tanitici serbest
 * birakilmadan yeni bir kaynak baglanmamalidir.
 */
export function attachEngine(video: HTMLVideoElement, options: EngineOptions): EngineHandle {
  const kind = detectEngine(options.url);

  if (kind === 'hls') {
    const hls = new Hls({
      lowLatencyMode: false,
      backBufferLength: options.live ? 30 : 90,
      maxBufferLength: Math.max(10, options.liveBufferSecs),
      liveSyncDurationCount: 3,
      manifestLoadingMaxRetry: 4,
      levelLoadingMaxRetry: 4,
      fragLoadingMaxRetry: 6,
    });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR:
          options.onError('Ag hatasi, yeniden deneniyor...', false);
          hls.startLoad();
          break;
        case Hls.ErrorTypes.MEDIA_ERROR:
          options.onError('Medya hatasi, kurtarilmaya calisiliyor...', false);
          hls.recoverMediaError();
          break;
        default:
          options.onError(`Yayin acilamadi: ${data.details}`, true);
          hls.destroy();
      }
    });
    hls.on(Hls.Events.MANIFEST_PARSED, () => options.onReady?.());
    hls.loadSource(options.url);
    hls.attachMedia(video);
    return {
      kind,
      destroy: () => hls.destroy(),
      seekToLive: () => {
        if (hls.liveSyncPosition !== null) video.currentTime = hls.liveSyncPosition;
      },
      levels: () =>
        hls.levels.map((level, index) => ({
          index,
          label: level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)} kbps`,
        })),
      setLevel: (index) => {
        hls.currentLevel = index;
      },
    };
  }

  if (kind === 'mpegts') {
    const player = mpegts.createPlayer(
      { type: 'mpegts', isLive: options.live, url: options.url },
      {
        enableWorker: true,
        liveBufferLatencyChasing: options.live,
        liveBufferLatencyMaxLatency: Math.max(4, options.liveBufferSecs + 2),
        liveBufferLatencyMinRemain: 1,
        lazyLoad: false,
        stashInitialSize: 128,
      },
    );
    player.on(mpegts.Events.ERROR, (type: string, detail: string) => {
      options.onError(`Yayin hatasi (${type}): ${detail}`, true);
    });
    player.attachMediaElement(video);
    player.load();
    options.onReady?.();
    return {
      kind,
      destroy: () => {
        try {
          player.pause();
          player.unload();
          player.detachMediaElement();
          player.destroy();
        } catch {
          /* zaten serbest birakilmis olabilir */
        }
      },
    };
  }

  video.src = options.url;
  const onError = () => options.onError('Tarayici bu yayin bicimini oynatamadi.', true);
  video.addEventListener('error', onError);
  options.onReady?.();
  return {
    kind: 'native',
    destroy: () => {
      video.removeEventListener('error', onError);
      video.removeAttribute('src');
      video.load();
    },
  };
}
