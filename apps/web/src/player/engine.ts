import Hls from 'hls.js';
import mpegts from 'mpegts.js';
import { withProxy } from '@appleiptv/core';

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
  /**
   * CORS proxy adresi.
   *
   * Onemli: film ve dizi dosyalari `<video src>` ile oynatildigi icin
   * tarayici CORS denetimi yapmaz. Canli yayinlar ise hls.js/mpegts.js
   * tarafindan XHR ile indirilir ve CORS denetimine takilir; bu yuzden
   * proxy asil burada gereklidir.
   */
  proxyUrl?: string;
  onError: (message: string, fatal: boolean) => void;
  onReady?: () => void;
}

/** Tarayici HLS'i yerel olarak oynatabiliyor mu? (Safari, iOS, tvOS) */
function supportsNativeHls(): boolean {
  const video = document.createElement('video');
  return Boolean(video.canPlayType('application/vnd.apple.mpegurl'));
}

/**
 * Adresin uzantisina gore hangi motorun gerektigini belirler.
 *
 * Uzantisi olmayan canli adresler saglayicilarda genellikle MPEG-TS akisidir;
 * tarayici bunlari yerel olarak oynatamadigi icin mpegts.js'e yonlendiriyoruz.
 */
export function detectEngine(url: string, live = false): EngineKind {
  const path = (url.split('?')[0] ?? '').toLowerCase();
  if (path.endsWith('.m3u8')) {
    if (supportsNativeHls()) return 'native';
    return Hls.isSupported() ? 'hls' : 'native';
  }
  if (path.endsWith('.ts') || path.endsWith('.mpegts') || path.endsWith('.flv')) {
    return mpegts.isSupported() ? 'mpegts' : 'native';
  }
  if (live && !/\.(mp4|m4v|mkv|webm|mov|avi)$/.test(path)) {
    return mpegts.isSupported() ? 'mpegts' : 'native';
  }
  return 'native';
}

/** `.../12345.ts` -> `.../12345.m3u8`. Xtream tarzi adreslerde ise yarar. */
export function toHlsVariant(url: string): string | undefined {
  const [base, query] = url.split('?');
  if (!base || !/\.(ts|mpegts)$/i.test(base)) return undefined;
  return base.replace(/\.(ts|mpegts)$/i, '.m3u8') + (query ? `?${query}` : '');
}

/**
 * Yayin acilmadiginda sirayla denenecek adresler.
 * Ilk adres her zaman kullanicinin sectigi adrestir.
 */
export function playbackCandidates(url: string, live: boolean): string[] {
  const candidates = [url];
  if (live) {
    const hlsVariant = toHlsVariant(url);
    if (hlsVariant) candidates.push(hlsVariant);
  }
  return candidates;
}

/**
 * Video etiketini uygun motora baglar. Donen tanitici serbest
 * birakilmadan yeni bir kaynak baglanmamalidir.
 */
export function attachEngine(video: HTMLVideoElement, options: EngineOptions): EngineHandle {
  const kind = detectEngine(options.url, options.live);
  const proxied = (url: string) => withProxy(url, options.proxyUrl);

  if (kind === 'hls') {
    const hls = new Hls({
      lowLatencyMode: false,
      backBufferLength: options.live ? 30 : 90,
      maxBufferLength: Math.max(10, options.liveBufferSecs),
      liveSyncDurationCount: 3,
      manifestLoadingMaxRetry: 4,
      levelLoadingMaxRetry: 4,
      fragLoadingMaxRetry: 6,
      // Hem oynatma listesi hem de parcalar proxy uzerinden gecmeli;
      // aksi halde CORS engeli yuzunden hicbir parca inmez.
      xhrSetup: options.proxyUrl
        ? (xhr: XMLHttpRequest, url: string) => {
            xhr.open('GET', proxied(url), true);
          }
        : undefined,
    });

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR:
          if (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR || data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT) {
            options.onError(
              options.proxyUrl
                ? 'Yayin listesi indirilemedi. Proxy calisiyor mu, adres dogru mu kontrol edin.'
                : 'Yayin listesi indirilemedi. Tarayici engeli (CORS) olabilir: Ayarlar > Gelismis bolumunden proxy tanimlayin.',
              true,
            );
            hls.destroy();
            return;
          }
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
    // Kaynak adresi bilerek ham birakiliyor: hls.js goreli parca adreslerini
    // bu adrese gore cozer. Proxy'ye sarilmis bir adres verilirse parcalar
    // proxy'nin kok dizinine gore cozulur ve indirilemez. Tasima katmani
    // yukaridaki `xhrSetup` ile zaten proxy uzerinden gecer.
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
      { type: 'mpegts', isLive: options.live, url: proxied(options.url) },
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
      const isNetwork = String(type).toLowerCase().includes('network');
      options.onError(
        isNetwork && !options.proxyUrl
          ? 'Yayin indirilemedi. Tarayici engeli (CORS) olabilir: Ayarlar > Gelismis bolumunden proxy tanimlayin.'
          : `Yayin hatasi (${type}): ${detail}`,
        true,
      );
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

  // Yerel oynatma: medya ogesi CORS denetimine tabi degildir, bu yuzden
  // adres proxy'siz birakilir (proxy gereksiz yere trafigi yavaslatir).
  video.src = options.url;
  const onError = () => {
    const code = video.error?.code;
    options.onError(
      code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
        ? 'Tarayici bu yayin bicimini oynatamadi (muhtemelen MPEG-TS veya HEVC).'
        : `Yayin acilamadi (hata kodu ${code ?? '?'}).`,
      true,
    );
  };
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
