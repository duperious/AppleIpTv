import { useCallback, useEffect, useRef, useState } from 'react';
import { attachEngine } from './engine';
import type { EngineHandle } from './engine';
import { formatPosition } from '../lib/format';

export interface MediaPlayerProps {
  url: string;
  title: string;
  subtitle?: string;
  live: boolean;
  liveBufferSecs: number;
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
  const { url, title, subtitle, live, liveBufferSecs, startPositionSecs, onProgress, onClose, onChannelStep, onNext } = props;
  const videoRef = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<EngineHandle | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const lastReport = useRef(0);

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

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControlsVisible(false), CONTROLS_TIMEOUT);
  }, []);

  // Kaynak degistiginde motoru yeniden kur.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setStatus('Yayin aciliyor...');
    setFatal(false);
    setPosition(0);
    setDuration(0);

    let handle: EngineHandle | null = null;
    handle = attachEngine(video, {
      url,
      live,
      liveBufferSecs,
      onError: (message, isFatal) => {
        setStatus(message);
        setFatal(isFatal);
      },
      onReady: () => {
        setStatus(undefined);
        // Motor kurulumu tamamlanmadan cagrilabildigi icin bir sonraki
        // mikro gorevde kalite listesini okuyoruz.
        queueMicrotask(() => setLevels(handle?.levels?.() ?? []));
        void video.play().catch(() => setStatus('Otomatik oynatma engellendi, oynat tusuna basin.'));
      },
    });
    engineRef.current = handle;

    return () => {
      handle?.destroy();
      engineRef.current = null;
    };
  }, [url, live, liveBufferSecs]);

  // Video etiketi olaylari.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTime = () => {
      setPosition(video.currentTime);
      if (video.buffered.length > 0) setBuffered(video.buffered.end(video.buffered.length - 1));
      const now = Date.now();
      if (onProgress && !live && now - lastReport.current > 5000 && video.duration > 0) {
        lastReport.current = now;
        onProgress(video.currentTime, video.duration);
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
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
    };
  }, [onProgress, live, startPositionSecs]);

  // Cikista son konumu kaydet.
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (!live && video && onProgress && video.duration > 0) {
        onProgress(video.currentTime, video.duration);
      }
    };
  }, [live, onProgress]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }, []);

  const seekBy = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video || live) return;
    video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + delta));
  }, [live]);

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
            <button type="button" className="btn" onClick={onClose}>
              Geri don
            </button>
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
                const video = videoRef.current;
                if (video && duration > 0) video.currentTime = ratio * duration;
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
