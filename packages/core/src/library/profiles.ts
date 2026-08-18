import type { Profile, ProfileSettings, WatchProgress } from '../types.js';
import { hashPin, randomId } from '../utils.js';

export const DEFAULT_SETTINGS: ProfileSettings = {
  resumeThresholdSecs: 30,
  completedAtPercent: 95,
  startScreen: 'home',
  lockedCategoryIds: [],
  hiddenCategoryIds: [],
  liveBufferSecs: 6,
  theme: 'dark',
  epgOffsetMinutes: 0,
};

/** Cocuk profillerinde yetiskin icerigi ayikladigimiz anahtar kelimeler. */
export const ADULT_KEYWORDS = ['adult', 'xxx', '+18', '18+', 'erotic', 'porn', 'yetiskin'];

export interface CreateProfileInput {
  name: string;
  avatar?: string;
  kids?: boolean;
  pin?: string;
  settings?: Partial<ProfileSettings>;
}

const AVATARS = ['🎬', '📺', '🍿', '⚽', '🎮', '🚀', '🐧', '🦊', '🌙', '⭐'];

export async function createProfile(input: CreateProfileInput): Promise<Profile> {
  const name = input.name.trim() || 'Profil';
  return {
    id: randomId('prof'),
    name,
    avatar: input.avatar ?? AVATARS[Math.floor(Math.random() * AVATARS.length)]!,
    createdAt: Date.now(),
    kids: input.kids ?? false,
    pinHash: input.pin ? await hashPin(input.pin) : undefined,
    settings: { ...DEFAULT_SETTINGS, ...input.settings },
  };
}

export async function verifyPin(profile: Profile, pin: string): Promise<boolean> {
  if (!profile.pinHash) return true;
  return (await hashPin(pin)) === profile.pinHash;
}

export async function setPin(profile: Profile, pin: string | null): Promise<Profile> {
  return { ...profile, pinHash: pin ? await hashPin(pin) : undefined };
}

/** Kategori adi yetiskin icerigi isaret ediyor mu? */
export function isAdultCategory(name: string): boolean {
  const lower = name.toLocaleLowerCase('tr');
  return ADULT_KEYWORDS.some((keyword) => lower.includes(keyword));
}

/** Izleme ilerlemesini gunceller ve "bitti" durumunu hesaplar. */
export function updateProgress(
  current: WatchProgress | undefined,
  patch: Omit<WatchProgress, 'updatedAt' | 'completed'>,
  settings: ProfileSettings,
): WatchProgress {
  const percent = patch.durationSecs > 0 ? (patch.positionSecs / patch.durationSecs) * 100 : 0;
  return {
    ...current,
    ...patch,
    updatedAt: Date.now(),
    completed: percent >= settings.completedAtPercent,
  };
}

/** Devam-et seridinde gosterilecek kayitlar. */
export function continueWatching(
  progress: readonly WatchProgress[],
  settings: ProfileSettings,
  limit = 20,
): WatchProgress[] {
  return progress
    .filter((entry) => !entry.completed && entry.positionSecs >= settings.resumeThresholdSecs && entry.kind !== 'live')
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}

export { AVATARS };
