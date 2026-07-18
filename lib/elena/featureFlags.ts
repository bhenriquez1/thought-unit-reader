// lib/elena/featureFlags.ts
// Feature flags for Elena Mode.
//
// All Elena Mode features are off by default. Flags gate the entire product
// (ELENA_MODE_ENABLED) and individual capabilities, so the workspace can be
// enabled in production incrementally without shipping incomplete features.
//
// Migration-safe: adding new flags here with `false` defaults means existing
// clients pick up the flag without any schema migration.

export type ElenaModeFlags = {
  /** Master switch — gates all Elena Mode UI and routes */
  ELENA_MODE_ENABLED:         boolean;
  /** Parent Dashboard (account management, progress overview) */
  PARENT_DASHBOARD_ENABLED:   boolean;
  /** Reading placement screener flow */
  PLACEMENT_SCREENER_ENABLED: boolean;
  /** Reward system (stars, streaks, badges) */
  REWARDS_ENABLED:            boolean;
  /** AI read-aloud and comprehension coaching */
  AI_COACHING_ENABLED:        boolean;
  /** Daily time limit enforcement */
  TIME_LIMIT_ENFORCEMENT:     boolean;
};

/** Safe defaults — all features off until explicitly enabled. */
export const ELENA_MODE_DEFAULT_FLAGS: ElenaModeFlags = {
  ELENA_MODE_ENABLED:         false,
  PARENT_DASHBOARD_ENABLED:   false,
  PLACEMENT_SCREENER_ENABLED: false,
  REWARDS_ENABLED:            false,
  AI_COACHING_ENABLED:        false,
  TIME_LIMIT_ENFORCEMENT:     false,
};

/**
 * Merge stored or environment flags with safe defaults.
 * Unknown keys in `overrides` are ignored — new flags in defaults win.
 */
export function resolveElenaModeFlags(
  overrides: Partial<ElenaModeFlags> = {},
): ElenaModeFlags {
  return { ...ELENA_MODE_DEFAULT_FLAGS, ...overrides };
}

/** Returns true only when the master switch AND the given flag are both on. */
export function isElenaFeatureEnabled(
  flags:   ElenaModeFlags,
  feature: keyof Omit<ElenaModeFlags, "ELENA_MODE_ENABLED">,
): boolean {
  return flags.ELENA_MODE_ENABLED && flags[feature];
}
