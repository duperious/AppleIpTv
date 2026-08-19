import type { SVGProps } from 'react';

/**
 * Arayuzde kullanilan simgeler. Disaridan bir simge kutuphanesi yerine
 * satir ici SVG kullaniyoruz: paket boyutu artmiyor ve renkler
 * `currentColor` ile temaya uyuyor.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.8V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.8" />
  </Icon>
);

export const TvIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="2.5" y="6" width="19" height="12.5" rx="2.5" />
    <path d="m8 3 4 3 4-3" />
  </Icon>
);

export const GuideIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
    <path d="M3 9.5h18M8 3v3M16 3v3M8 14h5" />
  </Icon>
);

export const FilmIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
    <path d="M7 4.5v15M17 4.5v15M2.5 12h19M2.5 8.2h4.5M2.5 15.8h4.5M17 8.2h4.5M17 15.8h4.5" />
  </Icon>
);

export const SeriesIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="7.5" width="18" height="13" rx="2.5" />
    <path d="M6 4.5h12M7.5 2h9" />
  </Icon>
);

export const StarIcon = ({ filled = false, ...props }: IconProps & { filled?: boolean }) => (
  <Icon {...props} fill={filled ? 'currentColor' : 'none'}>
    <path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9z" />
  </Icon>
);

export const SearchIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Icon>
);

export const SettingsIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.2a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1z" />
  </Icon>
);

export const PlayIcon = (props: IconProps) => (
  <Icon {...props} fill="currentColor" stroke="none">
    <path d="M8 5.5v13l11-6.5z" />
  </Icon>
);

export const PauseIcon = (props: IconProps) => (
  <Icon {...props} fill="currentColor" stroke="none">
    <rect x="7" y="5.5" width="3.4" height="13" rx="1.2" />
    <rect x="13.6" y="5.5" width="3.4" height="13" rx="1.2" />
  </Icon>
);

export const BackIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M15 5.5 8 12l7 6.5" />
  </Icon>
);

export const SkipBackIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M11 8.5a5.5 5.5 0 1 1-1.6 3.9" />
    <path d="M11 4.5v4.2H6.8" />
  </Icon>
);

export const SkipForwardIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M13 8.5a5.5 5.5 0 1 0 1.6 3.9" />
    <path d="M13 4.5v4.2h4.2" />
  </Icon>
);

export const VolumeIcon = ({ muted = false, ...props }: IconProps & { muted?: boolean }) => (
  <Icon {...props}>
    <path d="M4 9.5h3.2L11 6v12l-3.8-3.5H4z" />
    {muted ? <path d="m15.5 9.5 5 5m0-5-5 5" /> : <path d="M15 9.2a4 4 0 0 1 0 5.6M17.8 6.8a7.5 7.5 0 0 1 0 10.4" />}
  </Icon>
);

export const FullscreenIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
  </Icon>
);

export const PipIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
    <rect x="12" y="11" width="7.5" height="6" rx="1.4" fill="currentColor" stroke="none" />
  </Icon>
);

export const LiveIcon = (props: IconProps) => (
  <Icon {...props} fill="currentColor" stroke="none">
    <circle cx="12" cy="12" r="5" />
  </Icon>
);

export const PlusIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const LockIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2" />
    <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
  </Icon>
);
