// lib/adaptiveGuide/adaptiveGuideEngine.ts
// Core logic for the Adaptive Study Guide — builds a personalized guide that
// is student-dependent, not just page-dependent.
//
// Same page → different guide depending on:
//   • Whether the student has read it before
//   • Recall history and mistakes
//   • Which concept types are weak vs strong

import type { StudentProfile, LearnerState } from "./studentProfile";
import { classifyLearnerState } from "./studentProfile";

// ── Input unit shape (subset of CanonicalUnit / ThoughtUnitNavigatorEntry) ───

export interface AdaptableUnit {
  id: string;
  text: string;
  title?: string;
  canonicalType?: string;
  importanceScore?: number;
  priorityTier?: number;
  pageNumber?: number;
}

// ── Output ────────────────────────────────────────────────────────────────────

export interface ConceptConfidence {
  canonicalType: string;
  label: string;
  confidence: number;   // 0–100
  trend: "rising" | "falling" | "stable" | "unknown";
}

export interface AdaptiveSection {
  id: string;
  heading: string;
  body: string;
  units?: AdaptableUnit[];
  actionLabel?: string;   // e.g. "Review →", "Recall →", "Whiteboard →"
  actionType?: "recall" | "review" | "whiteboard" | "read";
  urgency?: "high" | "normal" | "low";
}

export interface AdaptiveMission {
  /** One-line framing for this study session */
  headline: string;
  estimatedMinutes: number;
  focusHint: string;
  /** ≤ 3 success criteria the student should hit before closing the page */
  successCriteria: string[];
}

export interface AdaptiveGuide {
  learnerState: LearnerState;
  mission: AdaptiveMission;
  sections: AdaptiveSection[];
  confidenceByType: ConceptConfidence[];
  /** Units the student should spend the most time on */
  priorityUnits: AdaptableUnit[];
}

// ── Label map ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  thesis:       "Core Thesis",
  definition:   "Definition",
  mechanism:    "Mechanism",
  application:  "Clinical Application",
  trap:         "DAT Trap",
  dat_fact:     "High-Yield Fact",
  clinical:     "Clinical Pearl",
  keyDetail:    "Key Detail",
  memoryAnchor: "Memory Hook",
  keyAnatomy:   "Key Anatomy",
  formula:      "Formula",
  comparison:   "Comparison",
  reference:    "Reference",
  filler:       "Supporting Detail",
  unknown:      "Concept",
};

// ── Estimated reading time ────────────────────────────────────────────────────

function estimateMinutes(units: AdaptableUnit[]): number {
  const totalChars = units.reduce((s, u) => s + u.text.length, 0);
  const readingMin = Math.ceil(totalChars / 1200);  // ~200 wpm
  const recallMin  = Math.ceil(units.length * 0.5);
  return Math.max(3, readingMin + recallMin);
}

// ── Confidence derivation ─────────────────────────────────────────────────────

function buildConfidences(
  units: AdaptableUnit[],
  profile: StudentProfile,
): ConceptConfidence[] {
  const typeGroups = new Map<string, AdaptableUnit[]>();
  for (const u of units) {
    const t = u.canonicalType ?? "unknown";
    if (!typeGroups.has(t)) typeGroups.set(t, []);
    typeGroups.get(t)!.push(u);
  }

  return [...typeGroups.keys()].map(ct => {
    const mastery = profile.masteryByType.find(m => m.canonicalType === ct);
    let confidence = 50; // baseline — no data
    let trend: ConceptConfidence["trend"] = "unknown";

    if (mastery) {
      confidence = mastery.masteryPct;
      // Simple trend: if last missed this type recently, it's falling
      const missedRecently = profile.recentMisses.some(uid =>
        units.some(u => u.id === uid && u.canonicalType === ct)
      );
      trend = missedRecently ? "falling" : mastery.masteryPct >= 80 ? "rising" : "stable";
    }

    return {
      canonicalType: ct,
      label: TYPE_LABELS[ct] ?? ct,
      confidence,
      trend,
    };
  }).sort((a, b) => a.confidence - b.confidence); // weakest first
}

// ── Mission builder ───────────────────────────────────────────────────────────

function buildMission(
  units: AdaptableUnit[],
  state: LearnerState,
  confidences: ConceptConfidence[],
): AdaptiveMission {
  const mins = estimateMinutes(units);
  const weakest = confidences.filter(c => c.confidence < 50);
  const strongest = confidences.filter(c => c.confidence >= 80);

  const coreUnits = units.filter(u =>
    u.canonicalType === "thesis" || u.canonicalType === "definition" || (u.importanceScore ?? 0) >= 70
  );

  switch (state) {
    case "first-read":
      return {
        headline: "First Read",
        estimatedMinutes: mins,
        focusHint: "Build your foundation. Read carefully — you haven't seen this page before.",
        successCriteria: [
          ...coreUnits.slice(0, 2).map(u => `Understand: ${u.title ?? u.text.slice(0, 50)}`),
          "Identify the key mechanism or process",
        ].slice(0, 3),
      };

    case "second-read":
      return {
        headline: "Second Read",
        estimatedMinutes: Math.max(3, Math.ceil(mins * 0.6)),
        focusHint: "You've read this before. Focus on what you couldn't explain last time.",
        successCriteria: [
          "Name the core concept without looking",
          ...coreUnits.slice(0, 1).map(u => `Explain: ${u.title ?? u.text.slice(0, 40)}`),
          "Identify at least one DAT trap on this page",
        ].slice(0, 3),
      };

    case "needs-review": {
      const weakLabel = weakest[0]?.label ?? "weak concepts";
      return {
        headline: "Targeted Review",
        estimatedMinutes: Math.max(5, Math.ceil(mins * 0.8)),
        focusHint: `Weak area: ${weakLabel}. Missed recall recently — work through the review flow below.`,
        successCriteria: [
          `Explain ${weakLabel} in your own words`,
          "Complete the recall questions below without looking",
          "Identify why you got it wrong last time",
        ],
      };
    }

    case "active-recall":
    default: {
      const strongLabel = strongest[0]?.label ?? "mastered concepts";
      return {
        headline: "Active Recall",
        estimatedMinutes: Math.max(3, Math.ceil(mins * 0.4)),
        focusHint: `You know ${strongLabel} well. Push to the harder material.`,
        successCriteria: [
          "Answer all recall questions from memory",
          "Connect at least one concept to a clinical scenario",
          "Check your DAT trap knowledge",
        ],
      };
    }
  }
}

// ── Section builder ───────────────────────────────────────────────────────────

function buildSections(
  units: AdaptableUnit[],
  state: LearnerState,
  profile: StudentProfile,
  confidences: ConceptConfidence[],
): AdaptiveSection[] {
  const sections: AdaptiveSection[] = [];

  // Weak areas first when in needs-review mode
  if (state === "needs-review") {
    const missedIds = new Set(profile.recentMisses);
    const weakUnits = units.filter(u => missedIds.has(u.id));
    if (weakUnits.length > 0) {
      sections.push({
        id: "weak-area",
        heading: "⚠️ Weak Area — Review First",
        body: "You missed these recently. Work through them before moving on.",
        units: weakUnits,
        actionLabel: "Review →",
        actionType: "review",
        urgency: "high",
      });
    }
  }

  // Core concepts
  const coreUnits = units.filter(u =>
    u.canonicalType === "thesis" || u.canonicalType === "definition"
  );
  if (coreUnits.length > 0) {
    const mastered = coreUnits.filter(u => profile.masteredUnitIds.includes(u.id));
    sections.push({
      id: "core",
      heading: state === "first-read" ? "🎯 Today's Goal" : `✓ Core Ideas (${mastered.length}/${coreUnits.length} mastered)`,
      body: state === "first-read"
        ? "These are the foundation concepts for this page."
        : mastered.length === coreUnits.length
          ? "You've mastered all core ideas here. Test yourself below."
          : `${coreUnits.length - mastered.length} concept(s) still need work.`,
      units: coreUnits,
      actionLabel: state === "first-read" ? "Read →" : "Recall →",
      actionType: state === "first-read" ? "read" : "recall",
    });
  }

  // Mechanisms
  const mechUnits = units.filter(u => u.canonicalType === "mechanism" || u.canonicalType === "formula");
  if (mechUnits.length > 0) {
    const mechConf = confidences.find(c => c.canonicalType === "mechanism");
    sections.push({
      id: "mechanism",
      heading: `🟢 Mechanism${mechConf ? ` — ${mechConf.confidence}% confidence` : ""}`,
      body: mechConf && mechConf.confidence < 60
        ? "This is a weak area. Trace the mechanism step by step."
        : "Understand the process, not just the outcome.",
      units: mechUnits,
      actionLabel: "Whiteboard →",
      actionType: "whiteboard",
    });
  }

  // Traps
  const trapUnits = units.filter(u => u.canonicalType === "trap" || u.canonicalType === "comparison");
  if (trapUnits.length > 0) {
    sections.push({
      id: "traps",
      heading: "⚠️ DAT Traps",
      body: "Examiners test these specifically. Know the distinctions.",
      units: trapUnits,
      actionLabel: "Recall →",
      actionType: "recall",
      urgency: "high",
    });
  }

  // Clinical / Pearls
  const pearlUnits = units.filter(u =>
    u.canonicalType === "clinical" || u.canonicalType === "memoryAnchor" || u.canonicalType === "application"
  );
  if (pearlUnits.length > 0) {
    sections.push({
      id: "pearls",
      heading: "💎 Clinical Pearls",
      body: "Real-world applications and expert insights.",
      units: pearlUnits,
    });
  }

  // High-yield facts (only show if not first-read or if high priority)
  const factUnits = units.filter(u =>
    u.canonicalType === "dat_fact" || u.canonicalType === "keyDetail"
  );
  if (factUnits.length > 0 && state !== "first-read") {
    sections.push({
      id: "facts",
      heading: "📊 DAT High-Yield Facts",
      body: "Frequently tested. Know these cold.",
      units: factUnits,
      actionLabel: "Recall →",
      actionType: "recall",
    });
  }

  return sections;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function buildAdaptiveGuide(
  units: AdaptableUnit[],
  profile: StudentProfile,
  pageIndex: number,
): AdaptiveGuide {
  const learnerState = classifyLearnerState(pageIndex, profile);
  const confidences  = buildConfidences(units, profile);
  const mission      = buildMission(units, learnerState, confidences);
  const sections     = buildSections(units, learnerState, profile, confidences);

  // Priority units: weak-area units first, then by importance score descending
  const missedIds = new Set(profile.recentMisses);
  const priorityUnits = [...units].sort((a, b) => {
    const aMissed = missedIds.has(a.id) ? 1 : 0;
    const bMissed = missedIds.has(b.id) ? 1 : 0;
    if (bMissed !== aMissed) return bMissed - aMissed;
    return (b.importanceScore ?? 0) - (a.importanceScore ?? 0);
  }).slice(0, 5);

  return { learnerState, mission, sections, confidenceByType: confidences, priorityUnits };
}
