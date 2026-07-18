// lib/elena/displayCopy.ts
// Personalized display copy for Elena Mode.
//
// RULES:
//   - NEVER hard-code "Elena" in these strings. Always use {name}.
//   - The child-facing product name is derived from the child's profile, not
//     a static label. Only displayed copy changes; all code uses stable names.
//   - getChildDisplayCopy() is the single source of truth for child-facing strings.

import type { ChildProfile } from "./types";

export type ChildDisplayCopy = {
  /** Workspace title shown in the app header */
  workspaceTitle:   string;
  /** Greeting shown at session start */
  welcomeGreeting: string;
  /** Short label for the reading section */
  readingLabel:    string;
  /** Encouragement shown on streak milestone */
  streakMessage:   string;
  /** Label for the child's library */
  libraryLabel:    string;
  /** Tab label for the child's progress view */
  progressLabel:   string;
};

/**
 * Returns personalized display copy for the child-facing UI.
 * Uses `preferredName` if set, otherwise falls back to `displayName`.
 * All strings use the child's name — never a hard-coded product name.
 */
export function getChildDisplayCopy(profile: ChildProfile): ChildDisplayCopy {
  const name = profile.preferredName ?? profile.displayName;

  return {
    workspaceTitle:  `${name}'s Learning Space`,
    welcomeGreeting: `Welcome back, ${name}!`,
    readingLabel:    `${name}'s Reading`,
    streakMessage:   `Great job, ${name}! Keep it up!`,
    libraryLabel:    `${name}'s Books`,
    progressLabel:   `${name}'s Progress`,
  };
}

/**
 * Returns just the workspace title — useful for page titles and tab labels
 * without needing the full display copy object.
 */
export function getChildWorkspaceTitle(profile: ChildProfile): string {
  return getChildDisplayCopy(profile).workspaceTitle;
}

/**
 * Returns the name to use in greetings: preferredName if set, else displayName.
 */
export function getChildGreetingName(profile: ChildProfile): string {
  return profile.preferredName ?? profile.displayName;
}
