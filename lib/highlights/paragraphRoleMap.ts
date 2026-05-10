import type { PageStory } from "@/lib/insights/buildPageStory";
import { isFillerSentence, classifySignal, signalTypeToParagraphRole } from "@/lib/insights/signalClassifier";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Reading role assigned to each paragraph on the current page.
 *
 * Roles are ordered by visual priority:
 *   primary_signal  — the core assertion / main idea  (amber)
 *   trap_warning    — common mistake / wrong move      (rose)
 *   decision_rule   — should/must/when-to rule         (blue)
 *   support_explanation — mechanism / how-it-works     (sky/teal)
 *   support_relation    — comparison / distinction     (sky)
 *   low_value           — filler / transition / header (no highlight)
 */
export type ParagraphRole =
  | "primary_signal"
  | "decision_rule"
  | "support_explanation"
  | "support_relation"
  | "trap_warning"
  | "low_value";

export type ParagraphRoleBlock = {
  paragraphIndex: number;
  text: string;
  role: ParagraphRole;
  /** Character start offset within pageText */
  start: number;
  /** Character end offset within pageText */
  end: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function norm(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Returns true if `paraText` contains the first `prefixLen` normalized chars
 * of `needle`.  Used to detect which paragraph hosts a story block.
 */
function paraContains(paraText: string, needle: string, prefixLen = 48): boolean {
  if (!needle || needle.length < 10) return false;
  const h = norm(paraText);
  const n = norm(needle).slice(0, prefixLen);
  return n.length >= 10 && h.includes(n);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Classify every paragraph on the current page into a reading role by
 * anchoring against story blocks.  When no story is available, lightweight
 * heuristics (keyword matching) are used as a fallback.
 *
 * @param pageText        Raw page text (character offsets reference this string)
 * @param story           PageStory for the current page — may be null
 * @param paragraphTexts  Pre-split paragraph strings from splitParagraphs (preferred).
 *                        Falls back to blank-line splitting of pageText.
 */
export function buildParagraphRoleMap(
  pageText: string,
  story: PageStory | null,
  paragraphTexts?: string[],
): ParagraphRoleBlock[] {
  if (!pageText) return [];

  // ── Build character-offset paragraph index ──────────────────────────────
  const rawParas = paragraphTexts?.length
    ? paragraphTexts
    : pageText.split(/\n\s*\n+/).map((p) => p.replace(/\s+/g, " ").trim()).filter((p) => p.length > 25);

  const paraIndex: Array<{ text: string; start: number; end: number }> = [];
  let searchFrom = 0;
  for (const para of rawParas) {
    if (!para) continue;
    const idx = pageText.indexOf(para.slice(0, 40), searchFrom);
    if (idx === -1) continue;
    const end = Math.min(idx + para.length, pageText.length);
    paraIndex.push({ text: para, start: idx, end });
    searchFrom = idx + 1;
  }

  if (!paraIndex.length) return [];

  // ── Heuristic-only path when no story is available ───────────────────────
  if (!story) {
    return paraIndex.map((p, i) => ({
      paragraphIndex: i,
      text: p.text,
      role: heuristicRole(p.text),
      start: p.start,
      end: p.end,
    }));
  }

  // ── Build story anchor list, ordered by role priority (first match wins) ─
  // Each entry: role to assign if any of its anchor texts is found in a paragraph.
  const roleSources: Array<{ role: ParagraphRole; anchors: (string | null | undefined)[] }> = [
    {
      role: "primary_signal",
      anchors: [
        story.patternBlock?.trigger,
        story.mainIdeaBlock?.text,
        story.mainIdea,
      ],
    },
    {
      role: "trap_warning",
      anchors: [
        story.trapBlock?.trap,
        story.trap?.sentence,
        ...story.trapSignals.slice(0, 2),
      ],
    },
    {
      role: "decision_rule",
      anchors: [
        story.bottomLineBlock?.text,
        story.decisionBlock?.action,
        story.decisionBlock?.threshold,
        ...story.applySignals.slice(0, 1),
      ],
    },
    {
      role: "support_explanation",
      anchors: [
        story.mechanismBlock?.text,
        story.applicationBlock?.text,
        ...story.supportingLogic.slice(0, 2),
        ...story.support.slice(0, 2),
      ],
    },
    {
      role: "support_relation",
      anchors: [
        story.relationBlock?.text,
        story.distinctionBlock?.text,
        ...story.relationSignals.slice(0, 2),
        ...story.comparisonSignals.slice(0, 2),
      ],
    },
  ];

  return paraIndex.map((p, i) => {
    for (const { role, anchors } of roleSources) {
      for (const anchor of anchors) {
        if (anchor && paraContains(p.text, anchor)) {
          return { paragraphIndex: i, text: p.text, role, start: p.start, end: p.end };
        }
      }
    }
    // Story anchors didn't match — fall back to heuristics
    return {
      paragraphIndex: i,
      text: p.text,
      role: heuristicRole(p.text),
      start: p.start,
      end: p.end,
    };
  });
}

// ---------------------------------------------------------------------------
// Heuristic classifier (no story)
// ---------------------------------------------------------------------------

function heuristicRole(text: string): ParagraphRole {
  // Filler sentences always map to low_value — suppress them from highlight pool
  if (isFillerSentence(text)) return "low_value";

  // Use signal classifier for signal-type-aware role assignment
  const { type } = classifySignal(text);
  const mappedRole = signalTypeToParagraphRole(type) as ParagraphRole;
  if (mappedRole !== "support_explanation") return mappedRole;

  // Fallback to original keyword patterns for explanation subtypes
  const t = text.toLowerCase();
  if (/\b(versus|vs\.|compared|unlike|whereas|distinguishes|contrast|similar to|differ)\b/.test(t))
    return "support_relation";
  return "support_explanation";
}
