import { withProxy } from '@appleiptv/core';
import { detectEngine } from '../player/engine';

export type DiagnosticStatus = 'ok' | 'warn' | 'fail' | 'skip';

export interface DiagnosticStep {
  id: string;
  title: string;
  status: DiagnosticStatus;
  detail: string;
  /** Kullanicinin ne yapmasi gerektigi. */
  hint?: string;
}

export interface DiagnosticsInput {
  /** Denenecek canli yayin adresi. */
  url: string;
  proxyUrl?: string;
  /** Saglayici belirli bir oynatici kimligi bekliyorsa. */
  userAgent?: string;
}

const TIMEOUT_MS = 12_000;

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Yanitin ilk baytlarindan icerik turunu tahmin eder. */
function classifyBody(text: string): { kind: string; playable: boolean } {
  const head = text.trimStart().slice(0, 400).toLowerCase();
  if (head.startsWith('#extm3u')) return { kind: 'HLS oynatma listesi (m3u8)', playable: true };
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) {
    return { kind: 'HTML sayfasi (yayin degil)', playable: false };
  }
  if (head.startsWith('{') || head.startsWith('[')) return { kind: 'JSON (yayin degil)', playable: false };
  if (text.charCodeAt(0) === 0x47) return { kind: 'MPEG-TS akisi', playable: true };
  return { kind: 'ikili veri', playable: true };
}

function shortError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return 'zaman asimi';
  return error instanceof Error ? error.message : String(error);
}

/**
 * Canli yayin zincirini bastan sona dener ve her adimin sonucunu dondurur.
 *
 * Amac, "acilmiyor" durumunu tek bir ekranda somut bir nedene indirgemek:
 * karisik icerik, CORS, proxy erisimi, saglayicinin reddi veya yanlis bicim.
 */
export async function runStreamDiagnostics(input: DiagnosticsInput): Promise<DiagnosticStep[]> {
  const steps: DiagnosticStep[] = [];
  const { url, proxyUrl, userAgent } = input;

  // 1) Karisik icerik: https sayfadan http yayin cekilemez.
  const pageSecure = location.protocol === 'https:';
  const streamInsecure = url.startsWith('http://');
  steps.push(
    pageSecure && streamInsecure
      ? {
          id: 'mixed-content',
          title: 'Sayfa guvenligi',
          status: 'fail',
          detail: 'Sayfa https, yayin adresi http. Tarayici bu istegi tamamen engeller.',
          hint: 'Uygulamayi http://localhost uzerinden acin veya https sunan bir proxy kullanin.',
        }
      : {
          id: 'mixed-content',
          title: 'Sayfa guvenligi',
          status: 'ok',
          detail: `Sayfa ${location.protocol.replace(':', '')}, yayin ${streamInsecure ? 'http' : 'https'} - uyumlu.`,
        },
  );

  // 2) Hangi oynatma motoru secilecek?
  const engine = detectEngine(url, true);
  steps.push({
    id: 'engine',
    title: 'Oynatma motoru',
    status: engine === 'native' ? 'warn' : 'ok',
    detail:
      engine === 'hls'
        ? 'hls.js (HLS) - tarayicida en uyumlu secenek.'
        : engine === 'mpegts'
          ? 'mpegts.js (MPEG-TS) - calisir ama HLS daha kararlidir.'
          : 'Tarayicinin kendi oynaticisi - MPEG-TS yayinlarda calismayabilir.',
    hint:
      engine === 'native'
        ? 'Xtream kaynaklarinda Ayarlar > Gelismis > "HLS tercih et" secenegini acin.'
        : undefined,
  });

  // 3) Proxy tanimli mi ve ayakta mi?
  if (!proxyUrl) {
    steps.push({
      id: 'proxy-configured',
      title: 'CORS proxy',
      status: 'warn',
      detail: 'Tanimli degil.',
      hint: 'Canli yayinlar tarayicida genellikle yalnizca proxy uzerinden acilir. "npm run proxy" calistirip adresini Ayarlar > Gelismis bolumune yazin.',
    });
  } else {
    let healthDetail = '';
    let healthStatus: DiagnosticStatus = 'ok';
    try {
      const origin = new URL(proxyUrl).origin;
      const response = await fetchWithTimeout(`${origin}/health`);
      healthDetail = response.ok ? `${origin} yanit veriyor.` : `${origin} -> HTTP ${response.status}`;
      healthStatus = response.ok ? 'ok' : 'warn';
    } catch (error) {
      healthStatus = 'fail';
      healthDetail = `Proxy'ye ulasilamadi (${shortError(error)}).`;
    }
    steps.push({
      id: 'proxy-configured',
      title: 'CORS proxy',
      status: healthStatus,
      detail: healthDetail,
      hint: healthStatus === 'fail' ? 'Proxy penceresi acik mi? "npm run proxy" ile baslatin.' : undefined,
    });
  }

  // 4) Saglayiciya dogrudan erisim (CORS gercekten engelliyor mu?)
  try {
    const response = await fetchWithTimeout(url, { headers: { Range: 'bytes=0-1023' } });
    steps.push({
      id: 'direct',
      title: 'Dogrudan erisim',
      status: response.ok ? 'ok' : 'warn',
      detail: `HTTP ${response.status} - saglayici tarayiciya dogrudan yanit veriyor.`,
    });
  } catch (error) {
    steps.push({
      id: 'direct',
      title: 'Dogrudan erisim',
      status: 'warn',
      detail: `Engellendi (${shortError(error)}). Bu beklenen bir durumdur: saglayici CORS basligi gondermiyor.`,
      hint: 'Proxy kullanildiginda sorun degil.',
    });
  }

  // 5) Proxy uzerinden gercek indirme
  if (!proxyUrl) {
    steps.push({
      id: 'via-proxy',
      title: 'Proxy uzerinden erisim',
      status: 'skip',
      detail: 'Proxy tanimli olmadigi icin denenmedi.',
    });
    return steps;
  }

  let playlistBody: string | undefined;
  try {
    const headers: Record<string, string> = {};
    if (userAgent) headers['X-Forward-User-Agent'] = userAgent;
    const response = await fetchWithTimeout(withProxy(url, proxyUrl), { headers });
    const text = (await response.text()).slice(0, 20_000);
    const classified = classifyBody(text);
    const finalUrl = response.headers.get('X-Final-Url');
    if (classified.kind.includes('m3u8')) playlistBody = text;

    steps.push({
      id: 'via-proxy',
      title: 'Proxy uzerinden erisim',
      status: response.ok && classified.playable ? 'ok' : 'fail',
      detail: [
        `HTTP ${response.status}`,
        `icerik: ${classified.kind}`,
        finalUrl && finalUrl !== url ? `yonlendirildi: ${finalUrl}` : undefined,
        !response.ok || !classified.playable ? `ilk satirlar: ${text.slice(0, 120).replace(/\s+/g, ' ')}` : undefined,
      ]
        .filter(Boolean)
        .join(' · '),
      hint:
        response.status === 403 || response.status === 401
          ? 'Saglayici istegi reddetti. Kullanici adi/sifre dogru mu, es zamanli baglanti sinirini asiyor musunuz?'
          : !classified.playable
            ? 'Saglayici yayin yerine bir hata sayfasi dondurdu. Adres veya abonelik durumunu kontrol edin.'
            : undefined,
    });
  } catch (error) {
    steps.push({
      id: 'via-proxy',
      title: 'Proxy uzerinden erisim',
      status: 'fail',
      detail: `Basarisiz (${shortError(error)}).`,
      hint: 'Proxy calisiyor mu ve adres dogru mu kontrol edin.',
    });
    return steps;
  }

  // 6) Gercek bir yayin parcasi inene kadar zinciri takip et.
  //    Ana liste (master playlist) once varyant listesine isaret ettigi
  //    icin en fazla iki seviye izliyoruz.
  if (playlistBody) {
    const firstUriOf = (body: string) =>
      body
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith('#'));

    let currentBody = playlistBody;
    let currentBase = url;
    let step: DiagnosticStep | undefined;

    for (let level = 0; level < 2; level++) {
      const nextUri = firstUriOf(currentBody);
      if (!nextUri) {
        step = {
          id: 'segment',
          title: 'Yayin parcasi',
          status: 'fail',
          detail: 'Oynatma listesi bos - saglayici su an yayin vermiyor.',
          hint: 'Kanal yayinda olmayabilir; baska bir kanal deneyin.',
        };
        break;
      }

      try {
        const target = nextUri.startsWith('http') ? nextUri : new URL(nextUri, currentBase).href;
        const response = await fetchWithTimeout(withProxy(target, proxyUrl));
        const buffer = await response.arrayBuffer();
        const text = new TextDecoder().decode(buffer.slice(0, 400));

        // Varyant listesine dustuysek bir seviye daha in.
        if (response.ok && text.trimStart().toLowerCase().startsWith('#extm3u')) {
          currentBody = new TextDecoder().decode(buffer);
          currentBase = target;
          continue;
        }

        step = {
          id: 'segment',
          title: 'Yayin parcasi',
          status: response.ok && buffer.byteLength > 0 ? 'ok' : 'fail',
          detail: `HTTP ${response.status} · ${buffer.byteLength} bayt indirildi.`,
          hint: response.ok
            ? undefined
            : 'Liste iniyor ama parcalar inmiyor: saglayici tarafinda es zamanli baglanti siniri veya bolge kisiti olabilir.',
        };
        break;
      } catch (error) {
        step = {
          id: 'segment',
          title: 'Yayin parcasi',
          status: 'fail',
          detail: `Indirilemedi (${shortError(error)}).`,
        };
        break;
      }
    }

    steps.push(
      step ?? {
        id: 'segment',
        title: 'Yayin parcasi',
        status: 'warn',
        detail: 'Oynatma listeleri iniyor ancak parcaya ulasilamadi.',
      },
    );
  }

  return steps;
}

/** Sonuclari panoya kopyalanabilir duz metne cevirir. */
export function formatDiagnostics(steps: readonly DiagnosticStep[], url: string): string {
  const icon: Record<DiagnosticStatus, string> = { ok: '[OK]', warn: '[!]', fail: '[HATA]', skip: '[-]' };
  const lines = [
    'AppleIpTv yayin tanilama',
    `Adres: ${url.replace(/(password=|\/)([^/&]{2})[^/&]*/gi, '$1$2***')}`,
    `Tarayici: ${navigator.userAgent}`,
    '',
    ...steps.map((step) => `${icon[step.status]} ${step.title}: ${step.detail}${step.hint ? ` -> ${step.hint}` : ''}`),
  ];
  return lines.join('\n');
}
