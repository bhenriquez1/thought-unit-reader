// lib/speech/studySpeechEngine.ts
// Converts CurrentPageStudyModel → ordered speech segments.
// Used exclusively by StudySpeechPanel — no direct PDF/paragraph dependency.

import type { CurrentPageStudyModel, VisualAnchor, VisualAnchorRole } from "@/lib/insights/currentPageStudyModel";
import { getImportanceTier, type ImportanceTier } from "@/lib/insights/importanceTiers";
import { groupThoughtUnits } from "@/lib/insights/domainPresets";
import type { ExpertAnchor } from "@/lib/insights/canonicalLeftPanel";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type StudySpeechMode =
  | "study"      // Thesis + visual anchors, LeftPanel (groupThoughtUnits) order
  | "highlights" // Visual anchors only, LeftPanel (groupThoughtUnits) order
  | "full"       // Thesis + visual anchors (LeftPanel order) + concept blocks
  | "focus"      // Thesis only (single sentence overview)
  | "guided"     // Visual anchors in importance order, paced/framed by star tier
  | "fullPage";  // Whole page text sentence-by-sentence

// Note: these are LeftPanel/source-text roles only — never RightPanel field names
// (coreIdea/mechanism/trap/... live in synthesizeTeachingOutput.ts and must stay
// out of this union, since Speech reads source anchors, not RightPanel prose).
export type SpeechSegmentRole =
  | "thesis"
  | "conceptBlock"
  | "visualAnchor"
  /** Guided mode's "Question" stage — a synthetic self-check prompt inserted
   *  after the Master and Trap stages, not a verbatim source anchor. */
  | "checkpoint";

export interface SpeechSegment {
  id: string;
  role: SpeechSegmentRole;
  /** Short label shown in panel UI */
  label: string;
  /** Formula-converted text actually spoken */
  text: string;
  /** Original un-converted text */
  rawText: string;
  /** Rate modifier relative to user speed: 0.85 (slow/careful) – 1.05 (normal) */
  rateModifier: number;
  /** Links to VisualAnchor.id — used to focus matching PDF highlight while speaking */
  evidenceRefId?: string;
  /** Guided mode only: star tier, same scale the left-panel navigator uses */
  tier?: ImportanceTier;
  /** Guided mode only: pause after this segment finishes, before the next one starts */
  pauseAfterMs?: number;
  /** Guided mode only: stop and wait for the reader to click Continue (or Explain)
   *  instead of auto-advancing after pauseAfterMs — the teach-loop checkpoints. */
  requiresConfirm?: boolean;
  /**
   * Number of spoken-text prefix words that are NOT present in rawText / the PDF.
   * When > 0, the TTS says a narration prefix (e.g. "Most important on this page: ")
   * before the anchor text. The PDF word-rect index must subtract this offset so the
   * yellow word box tracks the anchor text, not the narration prefix.
   */
  sourceTextWordOffset?: number;
}

export function buildSpeechTimeline({
  thoughtUnits,
  mode,
  activePageText = "",
  selectedUnitId,
}: {
  thoughtUnits: ExpertAnchor[];
  mode: StudySpeechMode;
  activePageText?: string;
  selectedUnitId?: string | null;
}): SpeechSegment[] {
  if (mode === "fullPage") return [];
  const units = thoughtUnits.slice();

  // byPageOrder: document reading order (text position in PDF).
  // Used for "full" mode — preserves the author's narrative flow.
  const byPageOrder = (items: ExpertAnchor[]) =>
    items.slice().sort((a, b) => {
      const ai = activePageText.toLowerCase().indexOf(a.exactText.toLowerCase().slice(0, 60));
      const bi = activePageText.toLowerCase().indexOf(b.exactText.toLowerCase().slice(0, 60));
      return (ai < 0 ? Number.POSITIVE_INFINITY : ai) - (bi < 0 ? Number.POSITIVE_INFINITY : bi);
    });

  // bySpeechPriority: canonical metadata priority order (lower speechPriority = higher value).
  // Used for focus/study/guided — ensures domain-critical anchors surface first regardless
  // of their position in the input array. canonicalLeftPanelUnits is already sorted this
  // way, but we sort explicitly here so any intermediate filter/map cannot break the order.
  const bySpeechPriority = (items: ExpertAnchor[]) =>
    items.slice().sort((a, b) =>
      (a.speechPriority ?? a.priorityTier ?? 5) - (b.speechPriority ?? b.priorityTier ?? 5)
    );

  const essential = (u: ExpertAnchor) => u.priorityTier >= 4 || u.category === "definition" || u.category === "application";
  const selected = selectedUnitId ? units.find((u) => u.id === selectedUnitId || u.evidenceRefId === selectedUnitId) : null;

  // Ordering per mode — each is explicit, not inherited from input array order:
  //   focus    → speechPriority order: highest-value canonical anchors first
  //   study    → speechPriority order: balanced priority among essential anchors
  //   highlights → arrival/painted order: matches the visual left-panel layout
  //   full     → page text order: preserves author's document reading order
  //   guided   → speechPriority order: domain-critical concepts lead the teaching sequence
  const chosen =
    mode === "focus"      ? bySpeechPriority(units.filter((u) => u.priorityTier >= 5 || u.importanceLabel === "Master This")) :
    mode === "study"      ? bySpeechPriority(units.filter(essential)) :
    mode === "highlights" ? units.filter((u) => u.grounded !== false) :
    mode === "guided"     ? bySpeechPriority(units) :
    byPageOrder(units);

  const ordered = selected && mode !== "full"
    ? [selected, ...chosen.filter((u) => u.id !== selected.id)]
    : chosen;

  const segments: SpeechSegment[] = [];
  const pushUnit = (unit: ExpertAnchor, label = unit.importanceLabel, prefix = "", overrideText?: string, role: SpeechSegmentRole = "visualAnchor") => {
    // sourceText is the verbatim anchor text — must match the PDF text layer for word sync.
    // spokenText prepends the guided-mode narration prefix for TTS only.
    const sourceText = (overrideText ?? unit.exactText).trim();
    const spokenText = prefix ? `${prefix}${sourceText}`.trim() : sourceText;
    if (sourceText.length < 8) return;
    // Count how many words the spoken prefix adds so the PDF word-rect index can
    // subtract them — the PDF doesn't contain narration phrases like
    // "Most important on this page:".
    const prefixWordCount = prefix ? prefix.trim().split(/\s+/).filter(Boolean).length : 0;
    segments.push({
      id: role === "checkpoint" ? `${unit.id}-${label.toLowerCase().replace(/\W+/g, "-")}` : unit.id,
      role,
      label,
      rawText: sourceText,                // PDF text-layer search: exact anchor text, no prefix
      text: formulaToSpeech(spokenText),  // TTS: includes narration prefix when present
      rateModifier: unit.priorityTier >= 5 ? 0.88 : unit.priorityTier >= 4 ? 0.92 : 0.98,
      evidenceRefId: unit.evidenceRefId,
      tier: { key: unit.priorityTier >= 5 ? "critical" : unit.priorityTier >= 4 ? "important" : "medium", stars: Math.min(5, Math.max(1, unit.priorityTier)), label: unit.importanceLabel },
      sourceTextWordOffset: prefixWordCount,
    });
  };

  if (mode === "guided") {
    const stage = (name: string, predicate: (u: ExpertAnchor) => boolean, prefix = "") => {
      ordered.filter(predicate).forEach((unit, index) => {
        pushUnit(unit, name, index === 0 ? prefix : "");
        const last = segments[segments.length - 1];
        if (last) {
          last.pauseAfterMs = name === "Master This" || name === "Danger Zone" ? 700 : 250;
          last.requiresConfirm = name === "Master This" || name === "Clinical Pearl" || name === "Danger Zone";
        }
      });
    };
    stage("Master This", (u) => u.priorityTier >= 5 || u.category === "thesis" || u.category === "definition", "Most important on this page: ");
    stage("Procedure Step", (u) => u.category === "mechanism" || u.category === "application" || u.category === "formula");
    stage("Clinical Pearl", (u) => u.category === "clinical");
    stage("Danger Zone", (u) => u.category === "trap");
    ordered
      .filter((u) => !segments.some((s) => s.evidenceRefId === u.evidenceRefId))
      .forEach((u) => pushUnit(u, u.importanceLabel));
    const checkpointTarget = ordered[0];
    if (checkpointTarget) {
      segments.push({
        id: `guided-question-${checkpointTarget.id}`,
        role: "checkpoint",
        label: "Check Your Understanding",
        rawText: `Quick check: why does this matter — ${checkpointTarget.title}?`,
        text: formulaToSpeech(`Quick check: why does this matter — ${checkpointTarget.title}?`),
        rateModifier: 0.92,
        pauseAfterMs: 900,
        requiresConfirm: true,
      });
    }
  } else if (mode === "study") {
    ordered.forEach((unit) => {
      pushUnit(unit, unit.importanceLabel);
      const explanation = unit.reason && unit.reason !== unit.importanceLabel
        ? `Why it matters: ${unit.reason}.`
        : `Why it matters: this is one of the page's expert-ranked thought units.`;
      pushUnit(unit, "Why It Matters", "", explanation, "checkpoint");
    });
  } else {
    ordered.forEach((unit) => pushUnit(unit));
  }

  console.log("[SPEECH_TIMELINE_SOURCE]", {
    mode,
    source: "canonical_left_panel_units",
    page: ordered[0]?.page ?? null,
    thoughtUnitId: ordered[0]?.id ?? null,
    sourceText: ordered[0]?.exactText.slice(0, 80) ?? null,
    fallbackUsed: ordered.some((u) => u.source !== "canonical_left_panel"),
    itemCount: segments.length,
  });

  // Integrity log: which canonical IDs appear in this mode's speech segments.
  // Compare against [CANONICAL_INTEGRITY] in pages/index.tsx to verify 1:1 coverage.
  const speechAnchorIds = [...new Set(segments.map(s => s.evidenceRefId).filter(Boolean))];
  console.log("[SPEECH_INTEGRITY]", {
    mode,
    segmentCount:          segments.length,
    uniqueCanonicalIds:    speechAnchorIds.length,
    canonicalIds:          speechAnchorIds,
    ordering:              mode === "full" ? "page-text-order"
                         : mode === "highlights" ? "painted-arrival-order"
                         : "speechPriority-order",
  });

  return segments;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formula-to-speech conversion
// Converts math symbols, Greek letters, chemical formulas → spoken English
// ─────────────────────────────────────────────────────────────────────────────

// Common chemical formulas (check before generic symbol replacement)
const CHEMICAL_MAP: [RegExp, string][] = [
  [/\bCO₂\b|\bCO2\b/gi, "carbon dioxide"],
  [/\bH₂O\b|\bH2O\b/gi, "water"],
  [/\bO₂\b|\bO2\b/gi, "oxygen"],
  [/\bN₂\b|\bN2\b/gi, "nitrogen"],
  [/\bH₂\b|\bH2\b/gi, "hydrogen"],
  [/\bNaCl\b/gi, "sodium chloride"],
  [/\bNa\+/gi, "sodium"],
  [/\bK\+/gi, "potassium"],
  [/\bCa2\+|Ca²\+/gi, "calcium"],
  [/\bMg2\+|Mg²\+/gi, "magnesium"],
  [/\bHCO₃\-|\bHCO3-/gi, "bicarbonate"],
  [/\bATP\b/g, "A T P"],
  [/\bADP\b/g, "A D P"],
  [/\bNADH\b/g, "N A D H"],
  [/\bNAD\+/g, "N A D plus"],
  [/\bFADH₂\b|\bFADH2\b/g, "F A D H 2"],
  [/\bpH\b/g, "p H"],
];

// Subscript digits → plain digits
const SUBSCRIPTS: [RegExp, string][] = [
  [/₀/g, "0"], [/₁/g, "1"], [/₂/g, "2"], [/₃/g, "3"], [/₄/g, "4"],
  [/₅/g, "5"], [/₆/g, "6"], [/₇/g, "7"], [/₈/g, "8"], [/₉/g, "9"],
];

// Superscripts → plain digits or "squared"/"cubed"
const SUPERSCRIPTS: [RegExp, string][] = [
  [/²/g, " squared"], [/³/g, " cubed"],
  [/⁰/g, " to the zero"], [/¹/g, ""],
  [/⁴/g, " to the fourth"], [/⁵/g, " to the fifth"],
];

// Math/logic operators → words
const OPERATORS: [RegExp, string][] = [
  [/→|⟶/g, " leads to "],
  [/←|⟵/g, " is caused by "],
  [/↑/g, " increases "],
  [/↓/g, " decreases "],
  [/⇌/g, " reversibly converts to "],
  [/≈/g, " approximately "],
  [/≤|⩽/g, " less than or equal to "],
  [/≥|⩾/g, " greater than or equal to "],
  [/≠/g, " not equal to "],
  [/∑/g, " sum of "],
  [/∏/g, " product of "],
  [/∫/g, " integral of "],
  [/∂/g, " partial derivative of "],
  [/∞/g, " infinity "],
  [/±/g, " plus or minus "],
  [/×/g, " times "],
  [/÷/g, " divided by "],
  [/√/g, " square root of "],
  [/∈/g, " is in "],
  [/∉/g, " is not in "],
  [/⊂/g, " is a subset of "],
  [/∪/g, " union "],
  [/∩/g, " intersection "],
  [/∀/g, " for all "],
  [/∃/g, " there exists "],
  [/∴/g, " therefore "],
  [/∵/g, " because "],
];

// Greek letters → spoken names
const GREEK: [RegExp, string][] = [
  [/\bΔ\b|\bΔ/g, "delta "],
  [/\bα\b/g, "alpha "],
  [/\bβ\b/g, "beta "],
  [/\bγ\b/g, "gamma "],
  [/\bδ\b/g, "delta "],
  [/\bε\b/g, "epsilon "],
  [/\bθ\b/g, "theta "],
  [/\bλ\b/g, "lambda "],
  [/\bμ\b/g, "mu "],
  [/\bπ\b/g, "pi "],
  [/\bρ\b/g, "rho "],
  [/\bσ\b/g, "sigma "],
  [/\bτ\b/g, "tau "],
  [/\bφ\b/g, "phi "],
  [/\bω\b/g, "omega "],
  [/\bΩ\b/g, "ohm "],
];

export function formulaToSpeech(text: string): string {
  if (!text) return text;
  let out = text;

  // Chemical formulas first (before subscript replacement)
  for (const [re, replacement] of CHEMICAL_MAP) {
    out = out.replace(re, replacement);
  }
  // Subscripts/superscripts
  for (const [re, r] of SUBSCRIPTS) out = out.replace(re, r);
  for (const [re, r] of SUPERSCRIPTS) out = out.replace(re, r);
  // Operators
  for (const [re, r] of OPERATORS) out = out.replace(re, r);
  // Greek letters
  for (const [re, r] of GREEK) out = out.replace(re, r);

  // Clean up multiple spaces
  return out.replace(/\s{2,}/g, " ").trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Role → label + rate map
// ─────────────────────────────────────────────────────────────────────────────

const ANCHOR_ROLE_LABEL: Record<VisualAnchorRole, string> = {
  coreIdea:        "Core Idea",
  definition:      "Definition",
  mechanism:       "Mechanism",
  exampleEvidence: "Example",
  keyDetail:       "Key Detail",
  confusionTrap:   "Watch Out",
  datFact:         "High-Yield Fact",
  clinicalPearl:   "Clinical Pearl",
  memoryHook:      "Memory Hook",
  keyAnatomy:      "Key Anatomy",
};

const ANCHOR_ROLE_RATE: Record<VisualAnchorRole, number> = {
  coreIdea:        0.95,
  definition:      0.92,
  mechanism:       0.92,
  exampleEvidence: 1.00,
  keyDetail:       0.98,
  confusionTrap:   0.85,
  datFact:         0.92,
  clinicalPearl:   0.92,
  memoryHook:      0.95,
  keyAnatomy:      0.92,
};

// LeftPanel order — same groupThoughtUnits(entries, presetId) call
// ThoughtUnitNavigator/ThoughtRoadmap use, flattened group-by-group. Every
// non-focus, non-guided mode reads anchors through this so Speech never
// drifts back into its own RightPanel-style field ordering.
function flattenInLeftPanelOrder(anchors: VisualAnchor[], presetId: string): VisualAnchor[] {
  return groupThoughtUnits<VisualAnchor>(anchors, presetId).flatMap((group) => group.items);
}

// Per-anchor importance tier (1-5, 5 = Master This) — falls back to the same
// kind-aware default lib/insights/canonicalLeftPanel.ts uses (thesis/definition
// = Master, trap/clinical/mechanism = Important) when the AI didn't assign an
// explicit priorityTier, so Speech's tier filters agree with the LeftPanel's.
function anchorTier(anchor: VisualAnchor): number {
  if (anchor.priorityTier != null) return anchor.priorityTier;
  if (anchor.kind === "thesis" || anchor.kind === "definition") return 5;
  if (anchor.kind === "trap" || anchor.kind === "clinical" || anchor.kind === "mechanism") return 4;
  return 3;
}

// Full mode's "page order": locate each anchor's verbatim span in the raw
// page text and sort by that position. Anchors that can't be located (no
// activePageText, or the span isn't found verbatim) keep their relative
// LeftPanel order and sort after every located anchor.
function sortInPageOrder(anchors: VisualAnchor[], activePageText: string): VisualAnchor[] {
  if (!activePageText) return anchors;
  const haystack = activePageText.toLowerCase();
  const indexOf = (anchor: VisualAnchor): number => {
    const needle = (anchor.spanStart ?? anchor.exactText.split(/\s+/).slice(0, 6).join(" ")).toLowerCase();
    const idx = needle ? haystack.indexOf(needle) : -1;
    return idx === -1 ? Number.POSITIVE_INFINITY : idx;
  };
  return anchors
    .map((anchor, i) => ({ anchor, i, pos: indexOf(anchor) }))
    .sort((a, b) => (a.pos - b.pos) || (a.i - b.i))
    .map((x) => x.anchor);
}

// VisualAnchor.id is reassigned independently every time RightPanel rebuilds its
// own CurrentPageStudyModel, so it cannot be compared against the PDF overlay's
// evidenceRefId (assigned by groundHighlightAnchors.ts/buildHighlightTargets in
// PureReaderView). Text identity is the only stable cross-pipeline key — same
// normalization the rest of the codebase already uses to dedup anchor text
// (see currentPageStudyModel.ts's seenAnchorKeys).
function anchorTextKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80);
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy builder — kept for reference only
// @deprecated Use buildSpeechTimeline() with canonical ExpertAnchor[] instead.
// StudySpeechPanel no longer calls this function.
// ─────────────────────────────────────────────────────────────────────────────

export function buildSpeechScript(
  model: CurrentPageStudyModel,
  mode: StudySpeechMode,
  presetId: string = "universal",
  activePageText: string = "",
  /** Verbatim text of anchors currently painted on the PDF (PureReaderView's
   *  paint-budgeted effectiveHighlightTargets) — "highlights" mode reads only
   *  these. Undefined/empty falls back to every visual anchor so callers that
   *  haven't wired this yet (or pages where nothing painted) don't go silent. */
  highlightedAnchorTexts?: string[],
): SpeechSegment[] {
  const segments: SpeechSegment[] = [];

  function push(
    id: string,
    role: SpeechSegmentRole,
    label: string,
    rawText: string,
    rateModifier: number,
    evidenceRefId?: string,
    tier?: ImportanceTier,
    pauseAfterMs?: number,
    requiresConfirm?: boolean,
  ): void {
    const trimmed = rawText?.trim();
    if (!trimmed || trimmed.length < 8) return;
    segments.push({
      id,
      role,
      label,
      rawText: trimmed,
      text: formulaToSpeech(trimmed),
      rateModifier,
      ...(evidenceRefId ? { evidenceRefId } : {}),
      ...(tier ? { tier } : {}),
      ...(pauseAfterMs !== undefined ? { pauseAfterMs } : {}),
      ...(requiresConfirm ? { requiresConfirm } : {}),
    });
  }

  // Note: no unconditional "Core Idea" push here. model.pageThesis is already
  // folded into model.visualAnchors as a thesis-kind anchor (verbatim AI anchor,
  // or the pageThesis fallback — see buildContractAnchorSeeds in
  // currentPageStudyModel.ts), and anchorTier() defaults thesis-kind anchors to
  // tier 5. Pushing pageThesis again here would (a) duplicate that anchor's
  // content when the AI did surface a verbatim thesis anchor, and (b) leak the
  // page thesis into "focus" (Master only) and "highlights" (painted anchors
  // only) modes even when it isn't itself a Master/painted anchor — violating
  // the canonical-units contract those two modes must follow.

  // ── Focus: only the Master This (tier-5) anchors, LeftPanel order ──────────
  if (mode === "focus") {
    const masterAnchors = flattenInLeftPanelOrder(model.visualAnchors, presetId).filter((a) => anchorTier(a) === 5);
    masterAnchors.forEach((anchor) => {
      push(
        anchor.id,
        "visualAnchor",
        ANCHOR_ROLE_LABEL[anchor.role] ?? "Key Point",
        anchor.exactText,
        ANCHOR_ROLE_RATE[anchor.role] ?? 0.95,
        anchor.id,
      );
    });
    console.log("[SPEECH_SOURCE]", {
      mode,
      source: "finalStudyModel.visualAnchors filtered to priorityTier===5 (Master This), LeftPanel order",
      presetId,
      itemCount: masterAnchors.length,
      anchorIds: masterAnchors.map((a) => a.id),
      sourceField: Array.from(new Set(masterAnchors.map((a) => a.sourceField))),
      firstItems: masterAnchors.slice(0, 3).map((a) => a.exactText.slice(0, 60)),
    });
    return segments;
  }

  // ── Guided: explicit named pedagogical sequence — Master → Pause → Explain →
  // Mechanism → Pearl → Trap → Question → Continue — instead of the LeftPanel's
  // own kind-grouped section order. Every page is taught the same way: lead
  // with what to master, then how it works, then the clinical payoff, then the
  // danger zone, then check understanding before moving on. Pause/Explain are
  // not separate segments — they're the existing requiresConfirm pause-and-wait
  // (StudySpeechPanel's teach-loop UI), where the reader explains by clicking
  // 💬 Explain during the pause instead of Continue. Question is a synthetic
  // checkpoint segment (role "checkpoint"), not a verbatim source anchor.
  if (mode === "guided") {
    const allAnchors = flattenInLeftPanelOrder(model.visualAnchors, presetId);
    const STAGE_KINDS: Record<string, string[]> = {
      master:    ["thesis", "definition"],
      mechanism: ["mechanism", "application", "formula", "comparison", "keyDetail", "keyAnatomy"],
      pearl:     ["clinical"],
      trap:      ["trap"],
    };
    const claimedIds = new Set<string>();
    const claim = (kinds: string[]) =>
      allAnchors.filter((a) => {
        if (claimedIds.has(a.id) || !kinds.includes(a.kind)) return false;
        claimedIds.add(a.id);
        return true;
      });
    const stageOrder: Array<{ stage: string; anchors: VisualAnchor[] }> = [
      { stage: "master",    anchors: claim(STAGE_KINDS.master) },
      { stage: "mechanism", anchors: claim(STAGE_KINDS.mechanism) },
      { stage: "pearl",     anchors: claim(STAGE_KINDS.pearl) },
      { stage: "trap",      anchors: claim(STAGE_KINDS.trap) },
    ];
    // Memory hooks / dat facts / references / anything the 4 named stages don't
    // cover — read last, so Guided never silently drops an anchor the
    // LeftPanel itself shows.
    const remainder = allAnchors.filter((a) => !claimedIds.has(a.id));
    if (remainder.length) stageOrder.push({ stage: "supporting", anchors: remainder });

    const STAGE_TIER_INDEX: Record<string, number> = { master: 0, mechanism: 1, pearl: 2, trap: 3, supporting: 4 };

    let flatIndex = 0;
    stageOrder.forEach(({ stage, anchors }) => {
      if (!anchors.length) return;
      const tier = getImportanceTier(STAGE_TIER_INDEX[stage] ?? 4);
      anchors.forEach((anchor) => {
        const isTopAnchor = flatIndex === 0;
        const rawText = isTopAnchor ? `Most important on this page: ${anchor.exactText}` : anchor.exactText;
        push(
          anchor.id,
          "visualAnchor",
          ANCHOR_ROLE_LABEL[anchor.role] ?? "Key Point",
          rawText,
          tier.stars >= 4 ? Math.min(ANCHOR_ROLE_RATE[anchor.role] ?? 0.95, 0.88) : (ANCHOR_ROLE_RATE[anchor.role] ?? 0.95),
          anchor.id,
          tier,
          stage === "master" || stage === "trap" ? 700 : 250,
          stage === "master" || stage === "trap" || stage === "pearl",
        );
        flatIndex++;
      });
      // Question: a checkpoint after Master and after Trap — the two stages
      // where "did this actually land?" matters most. Prefers a real AI mini-
      // test question for this page when one exists, otherwise a generic
      // self-explain prompt so the stage is never silently skipped.
      if (stage === "master" || stage === "trap") {
        const aiQuestion = stage === "trap"
          ? model.miniTestItems?.find((q) => q.type === "trap")?.question ?? model.miniTestItems?.[0]?.question
          : model.miniTestItems?.[0]?.question;
        const questionText = aiQuestion
          ? `Quick check: ${aiQuestion}`
          : stage === "trap"
            ? "Quick check: what's the one mistake students make here, and why?"
            : "Quick check: in your own words, why does this matter?";
        push(`guided-question-${stage}`, "checkpoint", "Check Your Understanding", questionText, 0.92, undefined, tier, 900, true);
      }
    });

    const totalChars = segments.reduce((n, s) => n + s.text.length, 0);
    const guidedAnchors = stageOrder.flatMap((s) => s.anchors);
    console.log("[SPEECH_SOURCE]", {
      mode,
      source: "finalStudyModel.visualAnchors via named pedagogical stages (Master→Mechanism→Pearl→Trap→Question, then supporting)",
      presetId,
      stageCounts: stageOrder.map((s) => ({ stage: s.stage, count: s.anchors.length })),
      itemCount: model.visualAnchors.length,
      charCount: totalChars,
      anchorIds: guidedAnchors.map((a) => a.id),
      sourceField: Array.from(new Set(guidedAnchors.map((a) => a.sourceField))),
      firstItems: guidedAnchors.slice(0, 3).map((a) => a.exactText.slice(0, 60)),
    });
    return segments;
  }

  // ── Highlight mode: only visual anchors, LeftPanel order ──────────────────
  // Same groupThoughtUnits(entries, presetId) flatten the left panel itself
  // renders with — Speech must never compute its own independent ordering.
  if (mode === "highlights") {
    const allOrdered = flattenInLeftPanelOrder(model.visualAnchors, presetId);
    const paintedKeys = highlightedAnchorTexts?.length
      ? new Set(highlightedAnchorTexts.map(anchorTextKey))
      : null;
    const orderedAnchors = paintedKeys
      ? allOrdered.filter((a) => paintedKeys.has(anchorTextKey(a.exactText)))
      : allOrdered;
    orderedAnchors.forEach((anchor) => {
      push(
        anchor.id,
        "visualAnchor",
        ANCHOR_ROLE_LABEL[anchor.role] ?? "Key Point",
        anchor.exactText,
        ANCHOR_ROLE_RATE[anchor.role] ?? 0.95,
        anchor.id,
      );
    });
    const totalChars = segments.reduce((n, s) => n + s.text.length, 0);
    console.log("[SPEECH_SOURCE]", {
      mode,
      source: paintedKeys
        ? "finalStudyModel.visualAnchors filtered to PDF-painted anchors (text match against effectiveHighlightTargets), LeftPanel order"
        : "finalStudyModel.visualAnchors grouped via groupThoughtUnits (LeftPanel order) — no painted-anchor filter wired, showing all",
      presetId,
      itemCount: orderedAnchors.length,
      droppedAsUnpainted: allOrdered.length - orderedAnchors.length,
      charCount: totalChars,
      anchorIds: orderedAnchors.map((a) => a.id),
      sourceField: Array.from(new Set(orderedAnchors.map((a) => a.sourceField))),
      firstItems: orderedAnchors.slice(0, 3).map((a) => a.exactText.slice(0, 60)),
    });
    return segments;
  }

  // ── Study: tier ≥4 (Master/Important) plus essential examples/definitions,
  // LeftPanel order — each segment carries evidenceRefId so the per-segment
  // sequential loop in StudySpeechPanel can focus the matching left-panel
  // highlight while that anchor is being spoken.
  if (mode === "study") {
    const studyAnchors = flattenInLeftPanelOrder(model.visualAnchors, presetId)
      .filter((a) => anchorTier(a) >= 4 || a.role === "definition" || a.role === "exampleEvidence");
    studyAnchors.forEach((anchor) => {
      push(
        anchor.id,
        "visualAnchor",
        ANCHOR_ROLE_LABEL[anchor.role] ?? "Key Point",
        anchor.exactText,
        ANCHOR_ROLE_RATE[anchor.role] ?? 0.95,
        anchor.id,
      );
    });
    console.log("[SPEECH_SOURCE]", {
      mode,
      source: "finalStudyModel.visualAnchors filtered to tier>=4 or definition/example, LeftPanel order",
      presetId,
      itemCount: studyAnchors.length,
      anchorIds: studyAnchors.map((a) => a.id),
      sourceField: Array.from(new Set(studyAnchors.map((a) => a.sourceField))),
      firstItems: studyAnchors.slice(0, 3).map((a) => a.exactText.slice(0, 60)),
    });
    return segments;
  }

  // ── Full: every LeftPanel thought unit, in page order, nothing else
  // (no conceptBlocks append — Speech must read only LeftPanel thought units).
  const pageOrderedAnchors = sortInPageOrder(model.visualAnchors, activePageText);
  pageOrderedAnchors.forEach((anchor) => {
    push(
      anchor.id,
      "visualAnchor",
      ANCHOR_ROLE_LABEL[anchor.role] ?? "Key Point",
      anchor.exactText,
      ANCHOR_ROLE_RATE[anchor.role] ?? 0.95,
      anchor.id,
    );
  });

  const totalChars = segments.reduce((n, s) => n + s.text.length, 0);
  console.log("[SPEECH_SOURCE]", {
    mode,
    source: "finalStudyModel.visualAnchors, page order",
    presetId,
    itemCount: segments.length,
    charCount: totalChars,
    anchorIds: pageOrderedAnchors.map((a) => a.id),
    sourceField: Array.from(new Set(pageOrderedAnchors.map((a) => a.sourceField))),
    firstItems: pageOrderedAnchors.slice(0, 3).map((a) => a.exactText.slice(0, 60)),
  });
  return segments;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode metadata for UI
// ─────────────────────────────────────────────────────────────────────────────

export interface ModeInfo {
  id: StudySpeechMode;
  label: string;
  description: string;
}

export const STUDY_SPEECH_MODES: ModeInfo[] = [
  { id: "focus",      label: "Focus",        description: "Core idea only" },
  { id: "study",      label: "Study",        description: "Thesis + highlighted anchors, LeftPanel order" },
  { id: "highlights", label: "Highlight Only", description: "Read just the highlighted anchors, LeftPanel order" },
  { id: "full",       label: "Full",         description: "Thesis + all anchors (LeftPanel order) + concept blocks" },
  { id: "guided",     label: "Guided",       description: "Most important points first, paced and framed by star tier" },
  { id: "fullPage",   label: "Current Page", description: "Whole page text sentence-by-sentence, click any sentence to start there" },
];
