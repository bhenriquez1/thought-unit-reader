// lib/speech/profiles.ts
// Voice personality profiles for the Narration system.
//
// Three presets: Calm | Professor | Exam Mode
// Each profile drives: speed, pause scaling, emphasis intensity,
// and optional per-sentence recap insertions.
//
// Persistence: profiles are saved to localStorage under the key
// "narration_profile_v1" so they survive page reloads.

// ============================================================================
// Types
// ============================================================================

export type ProfileId = 'calm' | 'professor' | 'exam';

export type EmphasisIntensity = 'off' | 'low' | 'high';

export interface VoiceProfile {
  id: ProfileId;
  label: string;
  description: string;
  /** Speech rate multiplier: 0.75–1.35 (1.0 = default) */
  speed: number;
  /** Scales all pause values: 0.8 (shorter) – 1.4 (longer) */
  pauseMultiplier: number;
  /** Emphasis intensity applied to key tokens */
  emphasisIntensity: EmphasisIntensity;
  /** If true, engine may insert a short recap sentence after headings */
  enableRecap: boolean;
}

// ============================================================================
// Built-in presets
// ============================================================================

export const PROFILE_PRESETS: Record<ProfileId, VoiceProfile> = {
  calm: {
    id: 'calm',
    label: 'Calm',
    description: 'Slightly slower, longer pauses — good for first read',
    speed: 0.90,
    pauseMultiplier: 1.30,
    emphasisIntensity: 'low',
    enableRecap: false,
  },
  professor: {
    id: 'professor',
    label: 'Professor',
    description: 'Normal speed, strong emphasis — Ninja Nerd lecture style',
    speed: 1.00,
    pauseMultiplier: 1.00,
    emphasisIntensity: 'high',
    enableRecap: false,
  },
  exam: {
    id: 'exam',
    label: 'Exam Mode',
    description: 'Faster, sharper pauses — rapid high-yield review',
    speed: 1.20,
    pauseMultiplier: 0.75,
    emphasisIntensity: 'high',
    enableRecap: false,
  },
};

export const DEFAULT_PROFILE_ID: ProfileId = 'professor';

// ============================================================================
// Saved preference shape
// ============================================================================

interface SavedPreference {
  profileId: ProfileId;
  /** Slider override (null = use profile default) */
  speedOverride: number | null;
  /** Announce figure/math before pausing */
  announceMedia: boolean;
}

const STORAGE_KEY = 'narration_profile_v1';

// ============================================================================
// Load / save
// ============================================================================

function defaultPref(): SavedPreference {
  return { profileId: DEFAULT_PROFILE_ID, speedOverride: null, announceMedia: false };
}

/**
 * Load narration preference from localStorage.
 * Falls back to the default if localStorage is unavailable (SSR) or corrupt.
 */
export function loadNarrationPreference(): SavedPreference {
  if (typeof window === 'undefined') return defaultPref();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPref();
    const parsed = JSON.parse(raw) as Partial<SavedPreference>;
    const profileId = (parsed.profileId && parsed.profileId in PROFILE_PRESETS)
      ? parsed.profileId
      : DEFAULT_PROFILE_ID;
    return {
      profileId,
      speedOverride: typeof parsed.speedOverride === 'number' ? parsed.speedOverride : null,
      announceMedia: typeof parsed.announceMedia === 'boolean' ? parsed.announceMedia : false,
    };
  } catch {
    return defaultPref();
  }
}

/**
 * Persist narration preference to localStorage.
 */
export function saveNarrationPreference(pref: SavedPreference): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pref));
  } catch {
    // Quota exceeded or private mode — silently ignore
  }
}

// ============================================================================
// Resolved profile helper
// ============================================================================

/**
 * Return the VoiceProfile for the given id, with an optional speed override
 * applied (slider value takes precedence over the profile default).
 */
export function resolveProfile(
  profileId: ProfileId,
  speedOverride: number | null,
): VoiceProfile {
  const base = PROFILE_PRESETS[profileId] ?? PROFILE_PRESETS[DEFAULT_PROFILE_ID];
  if (speedOverride !== null) {
    return { ...base, speed: clampSpeed(speedOverride) };
  }
  return base;
}

/** Clamp speed to allowed slider range */
export function clampSpeed(v: number): number {
  return Math.max(0.75, Math.min(1.35, v));
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export type { SavedPreference };
