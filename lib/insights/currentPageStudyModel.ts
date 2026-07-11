// lib/insights/currentPageStudyModel.ts
// Shared typed model emitted by RightPanel when OpenAI synthesis resolves.
// All downstream features (highlights, NoteLab, Recall Lab, CrossLinks) read from this.
//
// Data contract:
//   Right Panel = brain (builds this model)
//   Left Panel  = visual cortex (reads ONLY visualAnchors — no other highlight source)
//   NoteLab / Recall Lab = consume pageThesis, studyNotes, conceptBlocks

import type { MiniTestItem, NoteCard, PageType } from "@/lib/insights/synthesizeTeachingOutput";
import { cleanThesisLine, isLikelyHeaderLine } from "@/lib/insights/cleanActivePageText";
import type { ParagraphKind } from "@/lib/readerContracts";
import { getKindPriorityIndex } from "@/lib/insights/domainPresets";
import { deriveNoteCardsFromStudyModel } from "@/lib/notelab/deriveNoteCards";

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
  | "datFact"         // DAT / high-yield exam fact
  | "clinicalPearl"   // expert aside / high-value clinical insight
  | "memoryHook"       // verbatim mnemonic/analogy the page states
  | "keyAnatomy";      // anatomical structure/location statement

export type VisualAnchorSourceField =
  | "pageThesis"
  | "whyThisMatters"
  | "keyMechanism"
  | "commonConfusion"
  | "quickMemory"
  | "conceptBlock"
  | "conceptMap"
  | "clinicalPearl";

export type VisualAnchor = {
  /** Stable ID shared across left panel overlay, speech segment, and focusedEvidenceId */
  id:          string;
  /** Which right-panel field this anchor proves — used by speech engine */
  sourceField: VisualAnchorSourceField;
  exactText:   string;          // verbatim span as it appears on the page
  role:        VisualAnchorRole;
  /** Same ParagraphKind the left panel computes via anchorTypeToKind — lets
   *  speech group anchors with groupThoughtUnits() exactly as the left panel does. */
  kind:        ParagraphKind;
  reason:      string;          // one-line rationale from AI
  priority:    number;          // 1 = highest; ascending — determines render order
  spanStart?:  string;          // optional PDF span boundary
  spanEnd?:    string;
  /** AI-assigned 1-5 importance (5 = "Master This") — layered on top of, not
   *  replacing, the ordinal group-level tier in lib/insights/importanceTiers.ts. */
  priorityTier?: number;
  /** Domain-specific extraction category (e.g. "mechanism", "clinical pearl"). */
  domainCategory?: string;
  /** Semantic relevance to the page thesis (0–1). Used as a bounded tie-breaker in anchor sorting. */
  thesisRelevance?: number;
  /** Misconception risk score (0–1) — 1.0 for confusionTrap, 0.5 for datFact. */
  misconceptionRisk?: number;
  /** Procedural/mechanical importance (0–1) — 1.0 for mechanism, 0.7 for keyDetail. */
  proceduralImportance?: number;
  /** Conceptual connection strength to the rest of the page (0–1). */
  connectionStrength?: number;
  /** Combined speech priority — lower values surface earlier in all 6 speech modes. */
  speechPriority?: number;
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
  clinicalPearl:   7,
  keyDetail:       8,
  memoryHook:      9,
  keyAnatomy:      10,
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
  clinicalPearl:   "clinical",
  keyDetail:       "keyDetail",
  memoryHook:      "memoryAnchor",
  keyAnatomy:      "keyAnatomy",
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
    case "clinical_pearl": return "clinicalPearl";
    case "memory_hook":  return "quickMemory";
    case "anatomy":      return "keyMechanism";
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
    case "clinical_pearl": return "clinicalPearl";
    case "memory_hook":  return "memoryHook";
    case "anatomy":      return "keyAnatomy";
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
  /** Adaptive Expert Notebook cards — AI-generated when present, else derived
   *  client-side from studyNotes/conceptBlocks via deriveNoteCardsFromStudyModel. */
  noteCards: NoteCard[];
  /** Free-form topic tags for this page, when the AI synthesis resolved them. */
  tags?: string[];
  /** Pre-resolved canonical anchor IDs for each Study Note field.
   * Computed at model-build time — do not rediscover via sourceField matching at runtime. */
  studyNoteAnchorIds?: Record<string, string | null>;
};

type AnchorCandidate = {
  text: string; anchorType: string; reason: string;
  spanStart?: string | null; spanEnd?: string | null;
  priorityTier?: number | null; domainCategory?: string | null;
};

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
  priorityTier?: number | null;
  domainCategory?: string | null;
};

// Surgeon-sparse anchor pool: ONLY the AI's verbatim, page-text-grounded
// highlightAnchors (2-4 per page) plus the page thesis fallback. Earlier this
// also unioned in whyThisMatters/keyMechanism/commonConfusion/quickMemory/
// conceptBlock/conceptMap — paraphrased Right Panel prose, not verbatim PDF
// spans — which is why Speech/LeftPanel ended up reading RightPanel-style
// summaries and over-highlighting the page. Those fields stay Right-Panel-only
// (model.studyNotes/conceptBlocks); they no longer get promoted to anchors.
function buildContractAnchorSeeds(
  cleanThesis: string,
  aiCandidates: AnchorCandidate[],
): ContractAnchorSeed[] {
  const seeds: ContractAnchorSeed[] = [];

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
      priorityTier: a.priorityTier ?? undefined,
      domainCategory: a.domainCategory ?? undefined,
    });
  }

  // 2. pageThesis — the governing idea of the page (only when the AI didn't
  // already surface a thesis-type anchor above; avoids a near-duplicate).
  const hasThesisAnchor = seeds.some((s) => s.anchorType === "thesis");
  if (!hasThesisAnchor && cleanThesis.length >= 12) {
    seeds.push({ text: cleanThesis, role: "coreIdea", sourceField: "pageThesis", reason: "Page thesis", anchorType: "thesis" });
  }

  return seeds;
}

/** Word-overlap relevance between anchor text and the page thesis (0–1). */
function computeThesisRelevance(text: string, thesis: string): number {
  if (!thesis || thesis.length < 5) return 0;
  const thesisWords = new Set(thesis.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  if (!thesisWords.size) return 0;
  const anchorWords = text.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  if (!anchorWords.length) return 0;
  const overlap = anchorWords.filter(w => thesisWords.has(w)).length;
  return Math.min(1, overlap / Math.max(thesisWords.size, anchorWords.length));
}

function computeMisconceptionRisk(role: VisualAnchorRole): number {
  return role === "confusionTrap" ? 1.0 : role === "datFact" ? 0.5 : 0;
}

function computeProceduralImportance(role: VisualAnchorRole): number {
  return role === "mechanism" ? 1.0 : role === "keyDetail" ? 0.7 : role === "keyAnatomy" ? 0.5 : 0;
}

function computeConnectionStrength(role: VisualAnchorRole): number {
  const strengths: Partial<Record<VisualAnchorRole, number>> = {
    coreIdea: 1.0, mechanism: 0.9, confusionTrap: 0.8, definition: 0.7, datFact: 0.6,
  };
  return strengths[role] ?? 0.4;
}

/**
 * Pre-resolve the canonical anchor ID for each Study Note field at model-build time.
 * Uses sourceField as primary, then role-based fallbacks. Null when no anchor fits.
 */
function resolveStudyNoteAnchorId(
  field: string,
  visualAnchors: VisualAnchor[],
): string | null {
  if (!visualAnchors.length) return null;
  type SearchRule = { byField?: string; byRole?: VisualAnchorRole };
  const FIELD_SEARCHES: Record<string, SearchRule[]> = {
    whyThisMatters:    [{ byField: "whyThisMatters" }, { byRole: "exampleEvidence" }, { byRole: "coreIdea" }],
    keyMechanism:      [{ byField: "keyMechanism" }, { byRole: "mechanism" }, { byRole: "definition" }],
    commonConfusion:   [{ byField: "commonConfusion" }, { byRole: "confusionTrap" }],
    quickMemory:       [{ byField: "quickMemory" }, { byRole: "memoryHook" }, { byRole: "datFact" }],
    clinicalPearl:     [{ byField: "clinicalPearl" }, { byRole: "clinicalPearl" }],
    reasoningFlow:     [{ byRole: "mechanism" }, { byRole: "coreIdea" }],
    examSignal:        [{ byRole: "datFact" }, { byRole: "confusionTrap" }],
    clinicalReasoning: [{ byRole: "clinicalPearl" }, { byRole: "mechanism" }],
    commonMistake:     [{ byRole: "confusionTrap" }, { byField: "commonConfusion" }],
    examStrategy:      [{ byRole: "datFact" }, { byRole: "coreIdea" }],
    connectionMap:     [{ byRole: "coreIdea" }, { byRole: "mechanism" }],
  };
  const searches = FIELD_SEARCHES[field] ?? [{ byRole: "coreIdea" }];
  for (const rule of searches) {
    const found = rule.byField
      ? visualAnchors.find(a => a.sourceField === rule.byField)
      : visualAnchors.find(a => a.role === rule.byRole);
    if (found) return found.id;
  }
  return null;
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

  // Build visualAnchors — the final left-panel highlight contract: the AI's
  // verbatim highlightAnchors plus a pageThesis fallback, nothing else. Sorted
  // by role priority. Left panel uses ONLY this — no score-anchors, no
  // universalSpecificityScore, no fallbacks, no RightPanel-prose promotion.
  // IDs assigned post-sort with per-field counters so they are stable across
  // re-renders and map 1-to-1 to the Right Panel sourceField that owns each anchor.
  const contractSeeds = buildContractAnchorSeeds(cleanThesis, highlightAnchors);

  const seenAnchorKeys = new Set<string>();
  const dedupedSeeds = contractSeeds.filter((s) => {
    if (s.text.length < 12 || isLikelyHeaderLine(s.text)) return false;
    const key = s.text.toLowerCase().replace(/\s+/g, " ").slice(0, 50);
    if (seenAnchorKeys.has(key)) return false;
    seenAnchorKeys.add(key);
    return true;
  });

  const fieldCounters = new Map<string, number>();

  // Compute per-seed metadata before sorting so thesis relevance can act as a
  // bounded tie-breaker (Item B). The 0.5 cap ensures it never overrides role-level
  // differences (role priorities differ by ≥1), so domain-critical roles — confusionTrap,
  // mechanism, datFact, keyDetail — always maintain their relative precedence.
  const seededWithMeta = dedupedSeeds.map((s) => {
    const thesisRelevance      = computeThesisRelevance(s.text, cleanThesis);
    const basePriority         = rolePriority(s.role, presetId);
    const adjustedPriority     = basePriority - thesisRelevance * 0.5;
    return {
      seed: s,
      thesisRelevance,
      basePriority,
      adjustedPriority,
      misconceptionRisk:    computeMisconceptionRisk(s.role),
      proceduralImportance: computeProceduralImportance(s.role),
      connectionStrength:   computeConnectionStrength(s.role),
    };
  });

  const visualAnchors: VisualAnchor[] = seededWithMeta
    .sort((a, b) => a.adjustedPriority - b.adjustedPriority)
    .slice(0, 6)
    .map(({ seed: s, thesisRelevance, basePriority, adjustedPriority, misconceptionRisk, proceduralImportance, connectionStrength }) => {
      const n = (fieldCounters.get(s.sourceField) ?? 0) + 1;
      fieldCounters.set(s.sourceField, n);
      return {
        id:          `va-p${page}-${s.sourceField}-${n}`,
        sourceField: s.sourceField,
        exactText:   s.text,
        role:        s.role,
        kind:        VISUAL_ROLE_TO_KIND[s.role],
        reason:      s.reason,
        priority:    basePriority,
        spanStart:   s.spanStart ?? undefined,
        spanEnd:     s.spanEnd   ?? undefined,
        priorityTier:         s.priorityTier ?? undefined,
        domainCategory:       s.domainCategory ?? undefined,
        thesisRelevance,
        misconceptionRisk,
        proceduralImportance,
        connectionStrength,
        speechPriority: adjustedPriority,
      };
    });

  // Item A — pre-resolve canonical anchor IDs for each Study Note field so RightPanel
  // never needs to rediscover them via sourceField matching at runtime.
  const STUDY_NOTE_FIELDS = [
    "whyThisMatters", "keyMechanism", "commonConfusion", "quickMemory",
    "clinicalPearl", "reasoningFlow", "examSignal", "clinicalReasoning",
    "commonMistake", "examStrategy", "connectionMap",
  ];
  const studyNoteAnchorIds: Record<string, string | null> = {};
  for (const field of STUDY_NOTE_FIELDS) {
    studyNoteAnchorIds[field] = resolveStudyNoteAnchorId(field, visualAnchors);
  }

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

  const model: CurrentPageStudyModel = {
    page,
    bookId,
    pageType,
    pageThesis: cleanThesis,
    studyNoteAnchorIds,
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
    noteCards: [],
    tags: (synth.tags as string[] | null) ?? undefined,
  };

  const aiNoteCards = (synth.noteCards as NoteCard[] | null) ?? null;
  model.noteCards = aiNoteCards?.length ? aiNoteCards : deriveNoteCardsFromStudyModel(model);

  console.log("[NOTE_CARDS_READY]", {
    page,
    source: aiNoteCards?.length ? "ai" : "derived",
    count: model.noteCards.length,
    types: model.noteCards.map((c) => c.type),
  });

  return model;
}
