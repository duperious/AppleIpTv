import { useState } from 'react';
import { formatDiagnostics, runStreamDiagnostics } from '../lib/diagnostics';
import type { DiagnosticStep } from '../lib/diagnostics';

export interface DiagnosticsProps {
  url: string;
  proxyUrl?: string;
  userAgent?: string;
  /** Oynatici uzerinde gosterilirken daha koyu bir zemin kullanilir. */
  compact?: boolean;
}

const ICONS: Record<DiagnosticStep['status'], string> = {
  ok: '✓',
  warn: '!',
  fail: '✕',
  skip: '–',
};

/**
 * Canli yayin zincirini adim adim test edip sonucu gosterir.
 * "Acilmiyor" sikayetini somut bir nedene indirmek icin kullanilir.
 */
export function Diagnostics({ url, proxyUrl, userAgent, compact = false }: DiagnosticsProps) {
  const [steps, setSteps] = useState<DiagnosticStep[]>([]);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const run = async () => {
    setRunning(true);
    setCopied(false);
    try {
      setSteps(await runStreamDiagnostics({ url, proxyUrl, userAgent }));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className={`diagnostics ${compact ? 'diagnostics--compact' : ''}`}>
      <div className="diagnostics__actions">
        <button type="button" className="btn btn--primary" onClick={() => void run()} disabled={running}>
          {running ? 'Test ediliyor...' : 'Yayini test et'}
        </button>
        {steps.length > 0 && (
          <button
            type="button"
            className="btn"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(formatDiagnostics(steps, url));
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? 'Kopyalandi' : 'Sonucu kopyala'}
          </button>
        )}
      </div>

      {steps.length > 0 && (
        <ol className="diagnostics__list">
          {steps.map((step) => (
            <li key={step.id} className={`diagnostics__step is-${step.status}`}>
              <span className="diagnostics__icon" aria-hidden="true">{ICONS[step.status]}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.detail}</p>
                {step.hint && <p className="diagnostics__hint">{step.hint}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
