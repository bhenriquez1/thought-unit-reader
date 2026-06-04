// lib/insights/currentPageStudyModel.ts
// Shared typed model emitted by RightPanel when OpenAI synthesis resolves.
// All downstream features (highlights, NoteLab, Recall Lab, CrossLinks) read from this.
//
// Data contract:
//   Right Panel = brain (builds this model)
//   Left Panel  = visual cortex (reads ONLY visualAnchors — no other highlight source)
//   NoteLab / Recall Lab = consume pageThesis, studyNotes, conceptBlocks

import type { MiniTestItem, PageType } from "@/lib/insights/synthesizeTeachingOutput";
import { cleanThesisLine, isLikelyHeaderLine } from "@/lib/insights/cleanActivePageText";

// ---------------------------------------------------------------------------
// VisualAnchor — the final left-panel highlight contract.
// Built by buildStudyModel from AI anchor output; consumed by left panel only.
// Left-panel rule: if visualAnchors is empty, render zero highlights.
// ---------------------------------------------------------------------------

export type VisualAnchorRole =
  | "coreIdea"        // thesis / governing idea
  | "definition"      // term definition or concept pattern
  | "mechanism"       // causal chain / how/why
  | "exampleEvidence" // worked example or application
  | "keyDetail"       // important supporting detail / formula
  | "confusionTrap";  // common mistake or misconception

export type VisualAnchor = {
  exactText:  string;          // verbatim span as it appears on the page
  role:       VisualAnchorRole;
  reason:     string;          // one-line rationale from AI
  priority:   number;          // 1 = highest; ascending — determines render order
  spanStart?: string;          // optional PDF span boundary
  spanEnd?:   string;
};

// Role priority — determines render order and budget arbitration.
const ROLE_PRIORITY: Record<VisualAnchorRole, number> = {
  coreIdea:        1,
  mechanism:       2,
  definition:      3,
  confusionTrap:   4,
  exampleEvidence: 5,
  keyDetail:       6,
};

function anchorTypeToVisualRole(anchorType: string): VisualAnchorRole {
  switch (anchorType) {
    case "thesis":       return "coreIdea";
    case "definition":   return "definition";
    case "mechanism":    return "mechanism";
    case "application":  return "exampleEvidence";
    case "trap":         return "confusionTrap";
    case "formula":      return "keyDetail";
    case "example_step": return "exampleEvidence";
    case "conclusion":   return "keyDetail";
    default:             return "keyDetail";
  }
}

export type CurrentPageStudyModel = {
  page: number;
  bookId: string;
  /** pageTruthKey under which this model was synthesized — used for render-time staleness guard */
  pageTruthKey?: string;
  /** OpenAI page type classification — used for non-instructional skip in left panel */
  pageType?: string;
  pageThesis: string;
  studyNotes: {
    whyThisMatters: string | null;
    keyMechanism: string | null;
    commonConfusion: string | null;
    quickMemory: string | null;
    reasoningFlow: string | null;
    examSignal: string | null;
  };
  conceptBlocks: Array<{
    title: string;
    pattern: string;
    mechanism?: string;
    trap?: string;
    rule?: string;
  }>;
  miniTest: string[];
  miniTestItems?: MiniTestItem[];
  preReadRecallItems?: MiniTestItem[];
  /** AI anchor candidates — kept for backward compat; visualAnchors is the left-panel contract */
  highlightAnchors: Array<{ text: string; anchorType: string; reason: string }>;
  /** Final left-panel highlight contract — sorted by priority, built from AI output only */
  visualAnchors: VisualAnchor[];
  externalStudyLinks: Array<{ label: string; searchQuery: string; type: string }>;
  relatedVideoQueries?: string[];
};

type AnchorCandidate = { text: string; anchorType: string; reason: string; spanStart?: string | null; spanEnd?: string | null };

// Build 3–5 anchor candidates so the left panel (the "visual pathway") reflects the
// full right-panel brain — not just the one or two verbatim spans the model returned.
function buildAnchorCandidates(
  thesis: string,
  synth: Record<string, unknown>,
  conceptBlocks: Array<{ title: string; pattern: string }>,
): AnchorCandidate[] {
  const aiAnchors = (synth.highlightAnchors as AnchorCandidate[] | null) ?? [];
  const pageType = (synth.pageType as PageType | null) ?? null;

  // review_checkpoint pages must show zero AI highlights — questions should not be highlighted.
  if (pageType === "review_checkpoint") {
    console.log("[ANCHOR_REJECTED_HEADER]", {
      rejectedCount: "all",
      reason: "pageType=review_checkpoint — no highlights on review/checkpoint pages",
    });
    return [];
  }

  const fieldCandidates: AnchorCandidate[] = [
    { text: thesis,                                        anchorType: "thesis",      reason: "Page thesis" },
    { text: (synth.whyItMatters    as string | null) ?? "", anchorType: "application", reason: "Why this matters" },
    { text: (synth.keyMechanism    as string | null) ?? "", anchorType: "mechanism",   reason: "Key mechanism" },
    { text: (synth.commonConfusion as string | null) ?? "", anchorType: "trap",        reason: "Common confusion" },
    ...conceptBlocks.slice(0, 3).map((b) => ({
      text: b.pattern || "",
      anchorType: "definition" as const,
      reason: b.title ? `Concept: ${b.title.slice(0, 40)}` : "Concept block",
    })),
  ];

  const cleaned: AnchorCandidate[] = [...aiAnchors, ...fieldCandidates]
    .map((a) => ({ ...a, text: (cleanThesisLine(a.text) ?? "").trim() }))
    .filter((a) => a.text.length >= 12);

  const headerRejected: Array<{ text: string; anchorType: string }> = [];
  const bodyOnly = cleaned.filter((a) => {
    if (isLikelyHeaderLine(a.text)) {
      headerRejected.push({ text: a.text.slice(0, 80), anchorType: a.anchorType });
      return false;
    }
    return true;
  });
  if (headerRejected.length > 0) {
    console.log("[ANCHOR_REJECTED_HEADER]", { rejectedCount: headerRejected.length, rejected: headerRejected });
  }

  const seen = new Set<string>();
  const deduped: AnchorCandidate[] = [];
  for (const a of bodyOnly) {
    const key = a.text.toLowerCase().replace(/\s+/g, " ").slice(0, 50);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(a);
  }

  const candidates = deduped.slice(0, 8);
  console.log("[ANCHORS_FROM_RIGHT_PANEL]", {
    pageType,
    count:         candidates.length,
    aiAnchorCount: aiAnchors.length,
    texts:         candidates.map((a) => a.text.slice(0, 80)),
    kinds:         candidates.map((a) => a.anchorType),
  });
  return candidates;
}

export function buildStudyModel(
  view: {
    title?: string;
    coreIdea?: string;
    blocks: Array<{
      title: string;
      pattern?: string;
      surgicalReason?: string;
      trap?: string;
      rule?: string;
    }>;
    miniTest?: string[];
  },
  synth: Record<string, unknown>,
  bookId: string,
  page: number
): CurrentPageStudyModel {
  const thesis = (view.coreIdea || view.title || "") as string;
  const rawExtLinks = (synth.externalStudyLinks as Array<{ label: string; searchQuery: string; type: string }> | null) ?? [];
  const rawAIConcepts = (synth.aiConcepts as Array<{
    title: string; principle: string; mechanism: string; trap: string | null; rule: string;
  }> | null) ?? null;

  const conceptBlocks = (rawAIConcepts?.length ? rawAIConcepts : view.blocks).map((b: any) => ({
    title:     b.title ?? "",
    pattern:   b.principle ?? b.pattern ?? "",
    mechanism: b.mechanism ?? b.surgicalReason ?? undefined,
    trap:      b.trap ?? undefined,
    rule:      b.rule ?? undefined,
  }));

  const cleanThesis = cleanThesisLine(thesis) ?? thesis;
  const highlightAnchors = buildAnchorCandidates(cleanThesis, synth, conceptBlocks);

  // Build visualAnchors — the final left-panel highlight contract.
  // Sourced exclusively from AI anchor output; sorted by role priority.
  // Left panel uses ONLY this — no score-anchors, no universalSpecificityScore, no fallbacks.
  const visualAnchors: VisualAnchor[] = highlightAnchors
    .map((a) => {
      const role = anchorTypeToVisualRole(a.anchorType);
      return {
        exactText: a.text,
        role,
        reason:    a.reason,
        priority:  ROLE_PRIORITY[role] ?? 6,
        spanStart: (a as any).spanStart ?? undefined,
        spanEnd:   (a as any).spanEnd   ?? undefined,
      };
    })
    .sort((a, b) => a.priority - b.priority);

  const pageType = (synth.pageType as string | null) ?? undefined;

  console.log("[PAGE_BRAIN_READY]", {
    page,
    pageType,
    fields: {
      pageThesis:          cleanThesis?.slice(0, 60) ?? null,
      whyThisMatters:      !!((synth.whyItMatters   as string | null)),
      keyMechanism:        !!((synth.keyMechanism   as string | null)),
      commonConfusion:     !!((synth.commonConfusion as string | null)),
      quickMemory:         !!((synth.memoryAnchor   as string | null)),
      conceptBlocks:       conceptBlocks.length,
      conceptMap:          !!((synth.reasoningFlow  as string | null)?.includes("→")),
      checkpointQuestions: !!((synth.miniTestItems  as unknown[] | null)?.length),
      highlightTargets:    highlightAnchors.length,
    },
    leftPanelSource: "PageBrain.visualAnchors — right panel drives left panel",
  });

  console.log("[FINAL_MODEL_VISUAL_ANCHORS]", {
    page,
    count:   visualAnchors.length,
    roles:   visualAnchors.map((a) => a.role),
    topText: visualAnchors[0]?.exactText.slice(0, 80) ?? null,
  });

  return {
    page,
    bookId,
    pageType,
    pageThesis: cleanThesis,
    studyNotes: {
      whyThisMatters:  (synth.whyItMatters   as string | null) ?? null,
      keyMechanism:    (synth.keyMechanism   as string | null) ?? null,
      commonConfusion: (synth.commonConfusion as string | null) ?? null,
      quickMemory:     (synth.memoryAnchor   as string | null) ?? null,
      reasoningFlow:   (synth.reasoningFlow  as string | null) ?? null,
      examSignal:      (synth.examSignal     as string | null) ?? null,
    },
    conceptBlocks,
    miniTest: (view.miniTest ?? []).filter(Boolean),
    miniTestItems:      (synth.miniTestItems      as MiniTestItem[] | null) ?? undefined,
    preReadRecallItems: (synth.preReadRecallItems as MiniTestItem[] | null) ?? undefined,
    highlightAnchors,
    visualAnchors,
    externalStudyLinks: rawExtLinks,
    relatedVideoQueries: (synth.relatedVideoQueries as string[] | null) ?? undefined,
  };
}
