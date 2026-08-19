import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { attachEngine, playbackCandidates } from './engine';
import type { EngineHandle } from './engine';
import { formatPosition } from '../lib/format';

export interface MediaPlayerProps {
  url: string;
  title: string;
  subtitle?: string;
  live: boolean;
  liveBufferSecs: number;
  /** Canli yayinlarin CORS engeline takilmamasi icin proxy adresi. */
  proxyUrl?: string;
  /** Kaldigi yerden devam etmek icin baslangic konumu (sn). */
  startPositionSecs?: number;
  onProgress?: (positionSecs: number, durationSecs: number) => void;
  onClose: () => void;
  /** Canli yayinda kanal degistirme (yukari/asagi tuslari). */
  onChannelStep?: (direction: 1 | -1) => void;
  /** Dizi izlerken siradaki bolume gecis. */
  onNext?: () => void;
}

const SEEK_STEP = 10;
const CONTROLS_TIMEOUT = 3500;

/**
 * Tam ekran oynatici. HLS, MPEG-TS ve dogrudan dosya adreslerini
 * destekler; klavye ve uzaktan kumanda tuslariyla yonetilir.
 */
export function MediaPlayer(props: MediaPlayerProps) {
  const { url, title, subtitle, live, liveBufferSecs, proxyUrl, startPositionSecs, onProgress, onClose, onChannelStep, onNext } = props;
  const videoRef = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<EngineHandle | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const lastReport = useRef(0);
  /**
   * Son bilinen konum. Cikista video etiketi zaten bosaltilmis olabilecegi
   * icin ilerlemeyi dogrudan `video.currentTime`den degil buradan okuyoruz.
   */
  const lastKnown = useRef({ position: 0, duration: 0 });
  /** Her cizimde degisen geri cagriyi etkilere tasimadan guncel tutar. */
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const liveRef = useRef(live);
  liveRef.current = live;

  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState<string | undefined>('Yayin aciliyor...');
  const [fatal, setFatal] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [levels, setLevels] = useState<{ index: number; label: string }[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const [showSettings, setShowSettings] = useState(false);
  /** Otomatik oynatma icin sesi kapatmak zorunda kaldik mi? */
  const [autoMuted, setAutoMuted] = useState(false);
  /**
   * Denenen adres sirasi. Canli yayinlarda `.ts` acilmazsa ayni yayinin
   * `.m3u8` bicimi otomatik deneniyor.
   */
  const [attempt, setAttempt] = useState(0);
  /** Elle "yeniden dene" icin motoru bastan kurmayi tetikler. */
  const [reloadToken, setReloadToken] = useState(0);

  const candidates = useMemo(() => playbackCandidates(url, live), [url, live]);
  const activeUrl = candidates[Math.min(attempt, candidates.length - 1)] ?? url;

  useEffect(() => {
    setAttempt(0);
    setAutoMuted(false);
  }, [url]);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControlsVisible(false), CONTROLS_TIMEOUT);
  }, []);

  /**
   * Cikista son konumu kaydeder.
   *
   * Bilerek motor etkisinden once tanimlandi: React temizleyicileri tanim
   * sirasiyla calistirir, dolayisiyla video etiketi henuz bosaltilmamisken
   * gercek konumu okuyabiliyoruz. Okuma basarisiz olursa (motor onceden
   * kapanmissa) son bilinen degere duseriz.
   */
  useEffect(
    () => () => {
      const video = videoRef.current;
      const liveDuration = video && Number.isFinite(video.duration) ? video.duration : 0;
      const duration = liveDuration > 0 ? liveDuration : lastKnown.current.duration;
      const position = liveDuration > 0 ? video!.currentTime : lastKnown.current.position;
      if (!liveRef.current && duration > 0) onProgressRef.current?.(position, duration);
    },
    [],
  );

  // Kaynak degistiginde motoru yeniden kur.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setStatus('Yayin aciliyor...');
    setFatal(false);
    setPosition(0);
    setDuration(0);

    /**
     * Sesli otomatik oynatma tarayicilarca engellenebilir. Bu durumda
     * yayini sessiz baslatip kullaniciya tek tikla sesi acma secenegi
     * sunuyoruz; kullaniciyi bos bir ekranla birakmiyoruz.
     */
    const startPlayback = async () => {
      try {
        await video.play();
      } catch {
        video.muted = true;
        setMuted(true);
        setAutoMuted(true);
        try {
          await video.play();
        } catch {
          setStatus('Oynatma baslatilamadi, oynat tusuna basin.');
        }
      }
    };

    let handle: EngineHandle | null = null;
    handle = attachEngine(video, {
      url: activeUrl,
      live,
      liveBufferSecs,
      proxyUrl,
      onError: (message, isFatal) => {
        // Elde denenmemis alternatif adres varsa once onu deneyelim.
        if (isFatal && attempt < candidates.length - 1) {
          setStatus('Alternatif yayin adresi deneniyor...');
          setAttempt((current) => current + 1);
          return;
        }
        setStatus(message);
        setFatal(isFatal);
      },
      onReady: () => {
        setStatus(undefined);
        // Motor kurulumu tamamlanmadan cagrilabildigi icin bir sonraki
        // mikro gorevde kalite listesini okuyoruz.
        queueMicrotask(() => setLevels(handle?.levels?.() ?? []));
        void startPlayback();
      },
    });
    engineRef.current = handle;

    return () => {
      handle?.destroy();
      engineRef.current = null;
    };
  }, [activeUrl, attempt, candidates.length, live, liveBufferSecs, proxyUrl, reloadToken]);

  // Video etiketi olaylari.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    /** Konumu ref'e yazar; cikista kaydedilecek deger budur. */
    const capture = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        lastKnown.current = { position: video.currentTime, duration: video.duration };
      }
    };
    const onTime = () => {
      setPosition(video.currentTime);
      if (video.buffered.length > 0) setBuffered(video.buffered.end(video.buffered.length - 1));
      capture();
      const now = Date.now();
      if (!live && now - lastReport.current > 5000 && video.duration > 0) {
        lastReport.current = now;
        onProgressRef.current?.(video.currentTime, video.duration);
      }
    };
    const onMeta = () => {
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      if (startPositionSecs && startPositionSecs > 5 && Number.isFinite(video.duration)) {
        video.currentTime = startPositionSecs;
      }
    };
    const onPlay = () => {
      setPlaying(true);
      setStatus(undefined);
    };
    const onPause = () => setPlaying(false);
    const onWaiting = () => setStatus('Ara bellek dolduruluyor...');
    const onPlaying = () => setStatus(undefined);

    video.addEventListener('timeupdate', onTime);
    // Ileri/geri sarma ve duraklatma da konumu guncellemeli; aksi halde
    // sarmanin hemen ardindan cikilirsa eski konum kaydedilir.
    video.addEventListener('seeked', capture);
    video.addEventListener('pause', capture);
    video.addEventListener('ended', capture);
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('seeked', capture);
      video.removeEventListener('pause', capture);
      video.removeEventListener('ended', capture);
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
    };
  }, [live, startPositionSecs]);

  /** Motoru bastan kurar (yayin hic acilmadiysa tek care budur). */
  const retry = useCallback(() => {
    setFatal(false);
    setStatus('Yayin aciliyor...');
    setReloadToken((token) => token + 1);
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    // Yayin hic yuklenmediyse `play()` sessizce basarisiz olur; bu durumda
    // butonun tek anlamli davranisi motoru yeniden kurmaktir.
    if (!engineRef.current || video.readyState === 0) {
      retry();
      return;
    }
    if (video.paused) {
      void video.play().catch(() => setStatus('Oynatma baslatilamadi.'));
    } else {
      video.pause();
    }
  }, [retry]);

  const unmute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    if (video.volume === 0) video.volume = 1;
    setMuted(false);
    setVolume(video.volume);
    setAutoMuted(false);
  }, []);

  /**
   * Belirli bir konuma atlar.
   *
   * Hedef konumu aninda `lastKnown`e de yaziyoruz: medya ogesi sarma
   * tamamlanana kadar eski konumu bildirebiliyor ve sarmanin hemen
   * ardindan cikilirsa yanlis konum kaydedilirdi.
   */
  const seekTo = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video || live) return;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const target = Math.max(0, duration > 0 ? Math.min(duration, seconds) : seconds);
    video.currentTime = target;
    if (duration > 0) lastKnown.current = { position: target, duration };
  }, [live]);

  const seekBy = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video || live) return;
    seekTo(video.currentTime + delta);
  }, [live, seekTo]);

  const changeVolume = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    const next = Math.max(0, Math.min(1, video.volume + delta));
    video.volume = next;
    setVolume(next);
    if (next > 0) {
      video.muted = false;
      setMuted(false);
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void container.requestFullscreen().catch(() => undefined);
  }, []);

  const togglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {
      /* bazi bicimlerde desteklenmez */
    }
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      revealControls();
      switch (event.key) {
        case ' ':
        case 'k':
          event.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          if (!live) { event.preventDefault(); seekBy(SEEK_STEP); }
          break;
        case 'ArrowLeft':
          if (!live) { event.preventDefault(); seekBy(-SEEK_STEP); }
          break;
        case 'ArrowUp':
          event.preventDefault();
          if (live && onChannelStep) onChannelStep(1);
          else changeVolume(0.05);
          break;
        case 'ArrowDown':
          event.preventDefault();
          if (live && onChannelStep) onChannelStep(-1);
          else changeVolume(-0.05);
          break;
        case 'f':
          toggleFullscreen();
          break;
        case 'p':
          void togglePip();
          break;
        case 'm': {
          const video = videoRef.current;
          if (video) {
            video.muted = !video.muted;
            setMuted(video.muted);
          }
          break;
        }
        case 'Escape':
        case 'Backspace':
          event.preventDefault();
          onClose();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [changeVolume, live, onChannelStep, onClose, revealControls, seekBy, togglePip, toggleFullscreen, togglePlay]);

  useEffect(() => {
    revealControls();
    return () => window.clearTimeout(hideTimer.current);
  }, [revealControls]);

  const progressPercent = duration > 0 ? (position / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={`player ${controlsVisible ? '' : 'player--idle'}`}
      onMouseMove={revealControls}
      onClick={revealControls}
    >
      <video ref={videoRef} playsInline autoPlay className="player__video" />

      {status && (
        <div className="player__status">
          <div className={`player__status-text ${fatal ? 'player__status-text--error' : ''}`}>{status}</div>
          {fatal && (
            <div className="player__status-actions">
              <button type="button" className="btn btn--primary" onClick={retry}>
                Yeniden dene
              </button>
              <button type="button" className="btn" onClick={onClose}>
                Geri don
              </button>
            </div>
          )}
        </div>
      )}

      <div className="player__controls">
        <div className="player__top">
          <button type="button" className="btn btn--ghost" onClick={onClose} aria-label="Geri">
            ← Geri
          </button>
          <div className="player__titles">
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {live && <span className="badge badge--live">CANLI</span>}
        </div>

        <div className="player__bottom">
          {!live && (
            <div
              className="player__seekbar"
              role="slider"
              tabIndex={0}
              aria-label="Konum"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(position)}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const ratio = (event.clientX - rect.left) / rect.width;
                if (duration > 0) seekTo(ratio * duration);
              }}
            >
              <div className="player__seek-buffer" style={{ width: `${bufferedPercent}%` }} />
              <div className="player__seek-fill" style={{ width: `${progressPercent}%` }} />
            </div>
          )}

          <div className="player__buttons">
            <button type="button" className="btn btn--icon" onClick={togglePlay}>
              {playing ? '❚❚' : '▶'}
            </button>
            {!live && (
              <>
                <button type="button" className="btn btn--icon" onClick={() => seekBy(-SEEK_STEP)}>⏪</button>
                <button type="button" className="btn btn--icon" onClick={() => seekBy(SEEK_STEP)}>⏩</button>
                <span className="player__time">
                  {formatPosition(position)} / {duration > 0 ? formatPosition(duration) : '--:--'}
                </span>
              </>
            )}
            {live && engineRef.current?.seekToLive && (
              <button type="button" className="btn btn--ghost" onClick={() => engineRef.current?.seekToLive?.()}>
                Cana don
              </button>
            )}
            {autoMuted && (
              <button type="button" className="btn btn--primary player__unmute" onClick={unmute}>
                🔊 Sesi ac
              </button>
            )}
            <span className="player__spacer" />
            <button
              type="button"
              className="btn btn--icon"
              onClick={() => {
                const video = videoRef.current;
                if (!video) return;
                video.muted = !video.muted;
                setMuted(video.muted);
              }}
            >
              {muted || volume === 0 ? '🔇' : '🔊'}
            </button>
            <input
              className="player__volume"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(event) => {
                const video = videoRef.current;
                const next = Number(event.target.value);
                if (video) {
                  video.volume = next;
                  video.muted = next === 0;
                }
                setVolume(next);
                setMuted(next === 0);
              }}
              aria-label="Ses"
            />
            {onNext && (
              <button type="button" className="btn btn--ghost" onClick={onNext}>
                Sonraki bolum
              </button>
            )}
            {levels.length > 1 && (
              <div className="player__menu">
                <button type="button" className="btn btn--icon" onClick={() => setShowSettings((v) => !v)}>⚙</button>
                {showSettings && (
                  <ul className="player__menu-list">
                    <li>
                      <button
                        type="button"
                        className={currentLevel === -1 ? 'is-active' : ''}
                        onClick={() => {
                          engineRef.current?.setLevel?.(-1);
                          setCurrentLevel(-1);
                          setShowSettings(false);
                        }}
                      >
                        Otomatik
                      </button>
                    </li>
                    {levels.map((level) => (
                      <li key={level.index}>
                        <button
                          type="button"
                          className={currentLevel === level.index ? 'is-active' : ''}
                          onClick={() => {
                            engineRef.current?.setLevel?.(level.index);
                            setCurrentLevel(level.index);
                            setShowSettings(false);
                          }}
                        >
                          {level.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <button type="button" className="btn btn--icon" onClick={() => void togglePip()}>⧉</button>
            <button type="button" className="btn btn--icon" onClick={toggleFullscreen}>⛶</button>
          </div>
        </div>
      </div>
    </div>
  );
}
