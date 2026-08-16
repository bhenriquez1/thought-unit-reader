// lib/elena/avatar.ts
// Deterministic per-child avatar emoji. Pure function of childProfileId, so
// no new persisted field or migration is needed — the same child always
// gets the same avatar, and switching between children in the profile
// switcher visibly changes it.

const AVATAR_PALETTE = [
  "🦊", "🐼", "🦁", "🐨", "🦉", "🐸", "🦄", "🐢",
  "🐙", "🦋", "🐳", "🦖", "🐰", "🦔", "🐬", "🦜",
];

export function getAvatarEmoji(childProfileId: string): string {
  let hash = 0;
  for (let i = 0; i < childProfileId.length; i++) {
    hash = (hash * 31 + childProfileId.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[index];
}
