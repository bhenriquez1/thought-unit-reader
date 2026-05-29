// lib/highlights/sanitizeHighlightAnchors.ts
// Pre-grounding filter: removes chapter/header-contaminated anchors before they
// reach groundHighlightAnchors. Prevents header-body hybrids from painting on
// the left panel as if they were body sentences.

export type RawAnchorLike = {
  text: string;
  anchorType: string;
  reason: string;
};

function isContaminatedAnchor(text: string): boolean {
  // Explicit chapter / section markers
  if (/\bCHAPTER\b/i.test(text)) return true;
  if (/\bUNIT\s+\d/i.test(text)) return true;
  if (/^(Section|Part)\s+\d/i.test(text)) return true;

  const words = text.trim().split(/\s+/);

  // Span too long to be a clean thesis/definition (≤ 35 words enforced)
  if (words.length > 35) return true;

  // Excessive ALL-CAPS tokens (>35% of words ≥ 3 chars) → header debris
  const sig = words.filter(w => w.length >= 3);
  const upper = sig.filter(w => /^[A-Z]{2,}$/.test(w)).length;
  if (sig.length >= 4 && upper / sig.length > 0.35) return true;

  // Header-body hybrid: "Title Words 29 First word…"
  // Two or more Title-Cased/ALL-CAPS words, then a standalone number, then more text
  if (/^(?:[A-Z][A-Za-z]* ){2,}\d{1,3} [A-Z]/.test(text)) return true;

  return false;
}

export function sanitizeHighlightAnchors<T extends RawAnchorLike>(anchors: T[]): T[] {
  const kept: T[] = [];
  const rejected: Array<{ text: string; anchorType: string }> = [];

  for (const a of anchors) {
    if (isContaminatedAnchor(a.text)) {
      rejected.push({ text: a.text.slice(0, 80), anchorType: a.anchorType });
    } else {
      kept.push(a);
    }
  }

  if (rejected.length > 0) {
    console.log("[ANCHOR_SANITIZE_REJECT]", {
      rejectedCount: rejected.length,
      keptCount: kept.length,
      rejected,
    });
  }

  return kept;
}
