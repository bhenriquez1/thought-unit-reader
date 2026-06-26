// lib/speech/studySpeechEngine.ts
// Converts CurrentPageStudyModel → ordered speech segments.
// Used exclusively by StudySpeechPanel — no direct PDF/paragraph dependency.

import type { CurrentPageStudyModel, VisualAnchor, VisualAnchorRole, VisualAnchorSourceField } from "@/lib/insights/currentPageStudyModel";
import { getImportanceTier, type ImportanceTier } from "@/lib/insights/importanceTiers";
import { groupThoughtUnits } from "@/lib/insights/domainPresets";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type StudySpeechMode =
  | "study"      // Thesis + study notes (why/mech/confusion/exam)
  | "highlights" // Visual anchors only, Right Panel field order
  | "full"       // Thesis + notes + concept blocks + anchors
  | "focus"      // Thesis only (single sentence overview)
  | "guided"     // Visual anchors in importance order, paced/framed by star tier
  | "fullPage";  // Whole page text sentence-by-sentence

export type SpeechSegmentRole =
  | "thesis"
  | "whyThisMatters"
  | "keyMechanism"
  | "commonConfusion"
  | "examSignal"
  | "conceptBlock"
  | "visualAnchor"
  | "reasoningFlow";

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
};

const ANCHOR_ROLE_RATE: Record<VisualAnchorRole, number> = {
  coreIdea:        0.95,
  definition:      0.92,
  mechanism:       0.92,
  exampleEvidence: 1.00,
  keyDetail:       0.98,
  confusionTrap:   0.85,
  datFact:         0.92,
};

// Returns the id of the first visualAnchor whose sourceField matches — used to
// attach an evidenceRefId to study/full mode segments so per-segment eye guidance works.
function anchorForField(
  anchors: CurrentPageStudyModel["visualAnchors"],
  field: VisualAnchorSourceField,
): string | undefined {
  return anchors.find((a) => a.sourceField === field)?.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main builder
// ─────────────────────────────────────────────────────────────────────────────

export function buildSpeechScript(
  model: CurrentPageStudyModel,
  mode: StudySpeechMode,
  presetId: string = "universal",
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
    });
  }

  // ── Thesis — always first ──────────────────────────────────────────────────
  push("thesis", "thesis", "Core Idea", model.pageThesis, 0.93);

  if (mode === "focus") return segments;

  // ── Guided: drive directly off the LeftPanel's own grouping — same
  // groupThoughtUnits(entries, presetId) call ThoughtUnitNavigator/ThoughtRoadmap
  // use, so Guided speech reads in LeftPanel order, not an independently
  // computed RightPanel order. Tier is assigned per GROUP (every anchor in
  // "Core Ideas" shares one star tier), matching the left panel's semantics
  // exactly instead of a per-item index that drifted from it.
  if (mode === "guided") {
    if (segments[0]) {
      segments[0].tier = getImportanceTier(0);
      segments[0].pauseAfterMs = 600;
    }
    const groups = groupThoughtUnits<VisualAnchor>(model.visualAnchors, presetId);
    let flatIndex = 0;
    groups.forEach((group, groupIndex) => {
      const tier = getImportanceTier(groupIndex);
      group.items.forEach((anchor) => {
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
          tier.stars >= 4 ? 700 : 250,
        );
        flatIndex++;
      });
    });
    const totalChars = segments.reduce((n, s) => n + s.text.length, 0);
    console.log("[SPEECH_SOURCE]", {
      mode,
      source: "finalStudyModel.visualAnchors grouped via groupThoughtUnits (LeftPanel order)",
      presetId,
      groupCount: groups.length,
      itemCount: model.visualAnchors.length,
      charCount: totalChars,
    });
    return segments;
  }

  // ── Highlight mode: only visual anchors, Right Panel field order ─────────
  // Order matches what the student sees in the Right Panel: thesis → whyThisMatters
  // → keyMechanism → commonConfusion → quickMemory → conceptBlock → conceptMap.
  const FIELD_SPEECH_ORDER: Record<string, number> = {
    pageThesis:      1,
    whyThisMatters:  2,
    keyMechanism:    3,
    commonConfusion: 4,
    quickMemory:     5,
    conceptBlock:    6,
    conceptMap:      7,
  };
  if (mode === "highlights") {
    const sortedAnchors = [...model.visualAnchors].sort(
      (a, b) => (FIELD_SPEECH_ORDER[a.sourceField] ?? 99) - (FIELD_SPEECH_ORDER[b.sourceField] ?? 99),
    );
    sortedAnchors.forEach((anchor) => {
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
      source: "finalStudyModel.visualAnchors",
      itemCount: model.visualAnchors.length,
      charCount: totalChars,
    });
    return segments;
  }

  // ── Study + Full: study notes — each segment carries evidenceRefId so the
  // per-segment sequential loop in StudySpeechPanel can focus the matching
  // left-panel highlight while that note is being spoken.
  const sn      = model.studyNotes;
  const anchors = model.visualAnchors;
  push("why",  "whyThisMatters",  "Why This Matters",  sn.whyThisMatters  ?? "", 1.00,
       anchorForField(anchors, "whyThisMatters"));
  push("mech", "keyMechanism",    "Key Mechanism",     sn.keyMechanism    ?? "", 0.92,
       anchorForField(anchors, "keyMechanism"));
  push("conf", "commonConfusion", "Common Confusion",  sn.commonConfusion ? `Watch out. ${sn.commonConfusion}` : "", 0.88,
       anchorForField(anchors, "commonConfusion"));
  push("exam", "examSignal",      "Exam Signal",       sn.examSignal      ?? "", 0.90);

  if (mode === "study") return segments;

  // ── Full mode: reasoning flow + concept blocks + anchors ─────────────────
  if (sn.reasoningFlow && sn.reasoningFlow.includes("→")) {
    const nodes = sn.reasoningFlow.split(/\s*→\s*/).filter(Boolean);
    push("flow", "reasoningFlow", "Reasoning Chain",
      `The reasoning chain goes: ${nodes.join(", then ")}`,
      0.90);
  }

  model.conceptBlocks.slice(0, 5).forEach((block, i) => {
    const parts: string[] = [];
    if (block.title) parts.push(`${block.title}.`);
    if (block.pattern) parts.push(block.pattern);
    if (block.mechanism) parts.push(`This works because: ${block.mechanism}`);
    if (block.trap) parts.push(`Watch out: ${block.trap}`);
    push(
      `concept-${i}`,
      "conceptBlock",
      block.title ? block.title.slice(0, 30) : `Concept ${i + 1}`,
      parts.join(" "),
      0.93,
    );
  });

  model.visualAnchors.slice(0, 6).forEach((anchor) => {
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
    source: mode === "full" ? "finalStudyModel.visualAnchors + studyNotes + conceptBlocks" : "finalStudyModel.studyNotes",
    itemCount: segments.length,
    charCount: totalChars,
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
  { id: "study",      label: "Study",        description: "Thesis + all study notes" },
  { id: "highlights", label: "Highlight Only", description: "Read just the highlighted anchors, Right Panel order" },
  { id: "full",       label: "Full",         description: "All content + concept blocks" },
  { id: "guided",     label: "Guided",       description: "Most important points first, paced and framed by star tier" },
  { id: "fullPage",   label: "Current Page", description: "Whole page text sentence-by-sentence, click any sentence to start there" },
];
