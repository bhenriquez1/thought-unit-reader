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
import type { ParagraphKind } from "@/lib/readerContracts";
import { getKindPriorityIndex } from "@/lib/insights/domainPresets";

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
  | "confusionTrap"   // common mistake or misconception
  | "datFact";        // DAT / high-yield exam fact

export type VisualAnchorSourceField =
  | "pageThesis"
  | "whyThisMatters"
  | "keyMechanism"
  | "commonConfusion"
  | "quickMemory"
  | "conceptBlock"
  | "conceptMap";

export type VisualAnchor = {
  /** Stable ID shared across left panel overlay, speech segment, and focusedEvidenceId */
  id:          string;
  /** Which right-panel field this anchor proves — used by speech engine */
  sourceField: VisualAnchorSourceField;
  exactText:   string;          // verbatim span as it appears on the page
  role:        VisualAnchorRole;
  reason:      string;          // one-line rationale from AI
  priority:    number;          // 1 = highest; ascending — determines render order
  spanStart?:  string;          // optional PDF span boundary
  spanEnd?:    string;
};

// Role priority — determines render order and budget arbitration.
// Used only as the universal/no-preset fallback; by construction this matches
// DEFAULT_KIND_ORDER's relative order exactly, so passing no presetId (or
// "universal") to buildStudyModel reproduces the same anchor order as before.
const ROLE_PRIORITY: Record<VisualAnchorRole, number> = {
  coreIdea:        1,
  datFact:         2,
  mechanism:       3,
  confusionTrap:   4,
  exampleEvidence: 5,
  definition:      6,
  keyDetail:       7,
};

// Maps each VisualAnchorRole onto the closest-fit ParagraphKind, so the same
// domain-priority sequence the left-panel navigator/roadmap use (kindGroups
// ordinal position) can also rank anchors for the left-panel PDF overlay and
// the speech engine — "One Brain, Three Views" for anchor importance, not
// just labels.
const VISUAL_ROLE_TO_KIND: Record<VisualAnchorRole, ParagraphKind> = {
  coreIdea:        "thesis",
  datFact:         "dat_fact",
  mechanism:       "mechanism",
  confusionTrap:   "trap",
  exampleEvidence: "application",
  definition:      "definition",
  keyDetail:       "formula",
};

function rolePriority(role: VisualAnchorRole, presetId: string): number {
  if (!presetId || presetId === "universal") return ROLE_PRIORITY[role] ?? 6;
  return getKindPriorityIndex(presetId, VISUAL_ROLE_TO_KIND[role]);
}

function anchorTypeToSourceField(anchorType: string): VisualAnchorSourceField {
  switch (anchorType) {
    case "thesis":       return "pageThesis";
    case "dat_fact":     return "pageThesis";
    case "mechanism":    return "keyMechanism";
    case "definition":   return "keyMechanism";
    case "formula":      return "keyMechanism";
    case "trap":         return "commonConfusion";
    case "application":  return "whyThisMatters";
    case "example_step": return "whyThisMatters";
    case "conclusion":   return "pageThesis";
    default:             return "pageThesis";
  }
}

function anchorTypeToVisualRole(anchorType: string): VisualAnchorRole {
  switch (anchorType) {
    case "thesis":       return "coreIdea";
    case "dat_fact":     return "datFact";
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
    /** Level 2 — deeper reasoning fields, present only when Stage 2 synthesis resolves them */
    clinicalReasoning: string | null;
    commonMistake: string | null;
    examStrategy: string | null;
    connectionMap: string | null;
    clinicalPearl: string | null;
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
  synth: Record<string, unknown>,
  thesis: string,
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

  // Primary source: AI's highlightAnchors (2–4 verbatim spans from the page).
  // Minimal fallback: when AI returns null/empty, use the page thesis as a single coreIdea anchor
  // so the left panel always has at least one highlight on instructional content pages.
  const sourceAnchors: AnchorCandidate[] = aiAnchors.length > 0
    ? aiAnchors
    : thesis && thesis.length >= 12
      ? [{ text: thesis, anchorType: "thesis", reason: "Page thesis — AI returned no highlight anchors" }]
      : [];

  const cleaned: AnchorCandidate[] = [...sourceAnchors]
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

type ContractAnchorSeed = {
  text:        string;
  role:        VisualAnchorRole;
  sourceField: VisualAnchorSourceField;
  reason:      string;
  anchorType:  string;
  spanStart?:  string | null;
  spanEnd?:    string | null;
};

// Build the full proof-contract anchor pool — every right-panel field that makes a
// claim gets a corresponding left-panel highlight candidate. visualAnchors must NOT
// rely solely on synth.highlightAnchors; it is the union of all reasoning fields below.
function buildContractAnchorSeeds(
  synth: Record<string, unknown>,
  cleanThesis: string,
  conceptBlocks: CurrentPageStudyModel["conceptBlocks"],
  aiCandidates: AnchorCandidate[],
): ContractAnchorSeed[] {
  const seeds: ContractAnchorSeed[] = [];
  const clean = (s: string | null | undefined) => (s ? (cleanThesisLine(s) ?? s).trim() : "");

  // 1. AI highlightAnchors — verbatim spans the model selected.
  for (const a of aiCandidates) {
    seeds.push({
      text:        a.text,
      role:        anchorTypeToVisualRole(a.anchorType),
      sourceField: anchorTypeToSourceField(a.anchorType),
      reason:      a.reason,
      anchorType:  a.anchorType,
      spanStart:   a.spanStart,
      spanEnd:     a.spanEnd,
    });
  }

  // 2. pageThesis — the governing idea of the page.
  if (cleanThesis.length >= 12) {
    seeds.push({ text: cleanThesis, role: "coreIdea", sourceField: "pageThesis", reason: "Page thesis", anchorType: "thesis" });
  }

  // 3. whyThisMatters — application / significance of the idea.
  const whyThisMatters = clean(synth.whyItMatters as string | null);
  if (whyThisMatters.length >= 12) {
    seeds.push({ text: whyThisMatters, role: "exampleEvidence", sourceField: "whyThisMatters", reason: "Why this matters", anchorType: "application" });
  }

  // 4. keyMechanism — the causal chain / how-why.
  const keyMechanism = clean(synth.keyMechanism as string | null);
  if (keyMechanism.length >= 12) {
    seeds.push({ text: keyMechanism, role: "mechanism", sourceField: "keyMechanism", reason: "Key mechanism", anchorType: "mechanism" });
  }

  // 5. commonConfusion — common mistake / misconception.
  const commonConfusion = clean(synth.commonConfusion as string | null);
  if (commonConfusion.length >= 12) {
    seeds.push({ text: commonConfusion, role: "confusionTrap", sourceField: "commonConfusion", reason: "Common confusion", anchorType: "trap" });
  }

  // 6. quickMemory — high-yield memory anchor.
  const quickMemory = clean(synth.memoryAnchor as string | null);
  if (quickMemory.length >= 12) {
    seeds.push({ text: quickMemory, role: "keyDetail", sourceField: "quickMemory", reason: "Quick memory anchor", anchorType: "memory" });
  }

  // 7. conceptBlocks — mechanism / trap / pattern per concept.
  for (const block of conceptBlocks) {
    const mechanism = clean(block.mechanism);
    if (mechanism.length >= 12) {
      seeds.push({ text: mechanism, role: "mechanism", sourceField: "conceptBlock", reason: `Mechanism — ${block.title}`, anchorType: "mechanism" });
    }
    const trap = clean(block.trap);
    if (trap.length >= 12) {
      seeds.push({ text: trap, role: "confusionTrap", sourceField: "conceptBlock", reason: `Common trap — ${block.title}`, anchorType: "trap" });
    }
    const pattern = clean(block.pattern);
    if (pattern.length >= 12) {
      seeds.push({ text: pattern, role: "definition", sourceField: "conceptBlock", reason: `Concept — ${block.title}`, anchorType: "definition" });
    }
  }

  // 8. conceptMap — reasoning flow / causal chain diagram.
  const reasoningFlow = (synth.reasoningFlow as string | null) ?? "";
  if (reasoningFlow.includes("→")) {
    const t = clean(reasoningFlow);
    if (t.length >= 12) {
      seeds.push({ text: t, role: "mechanism", sourceField: "conceptMap", reason: "Concept map / reasoning flow", anchorType: "mechanism" });
    }
  }

  return seeds;
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
  page: number,
  presetId: string = "universal",
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
  const highlightAnchors = buildAnchorCandidates(synth, cleanThesis);

  // Build visualAnchors — the final left-panel highlight contract.
  // The full proof contract: pageThesis, whyThisMatters, keyMechanism, commonConfusion,
  // quickMemory, conceptBlocks, conceptMap, AND synth.highlightAnchors — not just the
  // raw AI anchors. Sorted by role priority. Left panel uses ONLY this — no
  // score-anchors, no universalSpecificityScore, no fallbacks.
  // IDs assigned post-sort with per-field counters so they are stable across re-renders
  // and map 1-to-1 to the Right Panel sourceField that owns each anchor.
  const contractSeeds = buildContractAnchorSeeds(synth, cleanThesis, conceptBlocks, highlightAnchors);

  const seenAnchorKeys = new Set<string>();
  const dedupedSeeds = contractSeeds.filter((s) => {
    if (s.text.length < 12 || isLikelyHeaderLine(s.text)) return false;
    const key = s.text.toLowerCase().replace(/\s+/g, " ").slice(0, 50);
    if (seenAnchorKeys.has(key)) return false;
    seenAnchorKeys.add(key);
    return true;
  });

  const fieldCounters = new Map<string, number>();
  const visualAnchors: VisualAnchor[] = dedupedSeeds
    .map((s) => ({
      id:          "" as string, // assigned after sort
      sourceField: s.sourceField,
      exactText:   s.text,
      role:        s.role,
      reason:      s.reason,
      priority:    rolePriority(s.role, presetId),
      spanStart:   s.spanStart ?? undefined,
      spanEnd:     s.spanEnd   ?? undefined,
    }))
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 12)
    .map((anchor) => {
      const n = (fieldCounters.get(anchor.sourceField) ?? 0) + 1;
      fieldCounters.set(anchor.sourceField, n);
      return { ...anchor, id: `va-p${page}-${anchor.sourceField}-${n}` };
    });

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
      clinicalReasoning: (synth.clinicalReasoning as string | null) ?? null,
      commonMistake:     (synth.commonMistake     as string | null) ?? null,
      examStrategy:       (synth.examStrategy      as string | null) ?? null,
      connectionMap:      (synth.connectionMap     as string | null) ?? null,
      clinicalPearl:      (synth.clinicalPearl     as string | null) ?? null,
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
