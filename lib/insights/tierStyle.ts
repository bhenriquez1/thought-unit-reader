// lib/insights/tierStyle.ts
// Shared priority-tier visual emphasis helper — promoted out of PdfEvidenceOverlay.tsx
// so other tier-aware UI (Adaptive Notebook cards) can reuse the same glow/border math
// without duplicating it.

/**
 * Scales a border/glow weight by priority tier (1-5) on top of a base kind/type color.
 * Tier 1 ("Optional"/low priority) gets a thin outline only; tier 5 gets the strongest
 * glow. Undefined defaults to tier 3 (medium).
 */
export function tierGlowStyle(
  tier: number | undefined | null,
  glowColor: string,
): { boxShadow: string; border: string } {
  const t = Math.min(5, Math.max(1, tier ?? 3));
  const blur = 1 + t * 0.4;             // 1.4px .. 3px — surgical, not glowing
  const alpha = 0.03 + t * 0.02;        // 0.05 .. 0.13
  const borderWidth = 1;                 // always 1px — thin annotation line
  const borderAlpha = 0.10 + t * 0.04;  // 0.14 .. 0.30
  return {
    boxShadow: `0 0 ${blur}px rgba(${glowColor},${alpha})`,
    border: `${borderWidth}px solid rgba(${glowColor},${borderAlpha})`,
  };
}
