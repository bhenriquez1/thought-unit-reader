import type {
  NormalizedPageBlock,
  PageClass,
  ParagraphRoleAssignment,
  ParagraphRoleV2,
  RawPageBlock,
  StoryBlockKindV2,
  StoryBlockV2,
  StoryEvidenceV2,
  StoryHighlight,
} from "./types";
import { segmentPageBlocks } from "./segmentPageBlocks";
import { normalizePageBlocks } from "./normalizePageBlocks";
import { classifyPageType } from "./classifyPageType";
import { assignParagraphRoles } from "./assignParagraphRoles";
import {
  bestCompleteSentence,
  canonicalTextKey,
  sentenceSafeSupport,
} from "./textCleanup";
import { buildParagraphNotes, type ParagraphNote } from "./buildParagraphNotes";

// ---------------------------------------------------------------------------
// Public type
// ---------------------------------------------------------------------------

export type PageStoryV2 = {
  truthKey: string;
  documentId: string;
  pageNumber: number;
  pageClass: PageClass;

  sourceBlocks: NormalizedPageBlock[];
  readingOrder: string[];

  signalBlock:     StoryBlockV2 | null;
  ruleBlock:       StoryBlockV2 | null;
  mechanismBlock:  StoryBlockV2 | null;
  actionBlock:     StoryBlockV2 | null;
  trapBlock:       StoryBlockV2 | null;
  bottomLineBlock: StoryBlockV2 | null;

  supportBlocks: StoryBlockV2[];

  paragraphRoles: ParagraphRoleAssignment[];
  paragraphNotes: ParagraphNote[];
  highlights:     StoryHighlight[];
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function buildPageStoryV2(input: {
  documentId: string;
  pageNumber: number;
  truthKey: string;
  pageText: string;
  layoutBlocks?: RawPageBlock[];
}): PageStoryV2 {
  const rawBlocks        = segmentPageBlocks(input.pageText, input.layoutBlocks);
  const normalizedBlocks = normalizePageBlocks(rawBlocks);
  const pageClass        = classifyPageType(normalizedBlocks);
  const paragraphRoles   = assignParagraphRoles(normalizedBlocks, pageClass);

  const baseStory = synthesizeStory({
    truthKey:    input.truthKey,
    documentId:  input.documentId,
    pageNumber:  input.pageNumber,
    pageClass,
    blocks:      normalizedBlocks,
    assignments: paragraphRoles,
  });

  const finalizedStory   = finalizeStory(baseStory);
  const highlights       = mapStoryToHighlights(finalizedStory);
  const paragraphNotes   = buildParagraphNotes(normalizedBlocks, paragraphRoles, pageClass);

  return { ...finalizedStory, highlights, paragraphNotes };
}

// ---------------------------------------------------------------------------
// Story synthesis
// ---------------------------------------------------------------------------

const SUPPORT_ROLES: ParagraphRoleV2[] = [
  "support_explanation",
  "support_relation",
  "support_distinction",
];

type SynthesisCtx = {
  truthKey:    string;
  documentId:  string;
  pageNumber:  number;
  pageClass:   PageClass;
  blocks:      NormalizedPageBlock[];
  assignments: ParagraphRoleAssignment[];
};

function synthesizeStory(ctx: SynthesisCtx): Omit<PageStoryV2, "highlights" | "paragraphNotes"> {
  const signalSrc    = topBlockForRole("primary_signal", ctx.blocks, ctx.assignments);
  const ruleSrc      = topBlockForRole("decision_rule",  ctx.blocks, ctx.assignments);
  const mechSrc      = topBlockForRole("mechanism",      ctx.blocks, ctx.assignments);
  const trapSrc      = topBlockForRole("trap_warning",   ctx.blocks, ctx.assignments);
  const btmSrc       = topBlockForRole("bottom_line",    ctx.blocks, ctx.assignments);

  // Build a set of block IDs already claimed by named primary roles so that
  // support blocks and fallback chains cannot re-use the same source block
  // (which would produce semantic collapse — identical sentences in Signal +
  // Action + BottomLine on sparse pages).
  const usedPrimaryIds = new Set<string>(
    [signalSrc, ruleSrc, mechSrc, trapSrc, btmSrc]
      .filter((b): b is NormalizedPageBlock => b !== null)
      .map((b) => b.id),
  );

  const supportSrcs  = topBlocksForRoles(SUPPORT_ROLES,  ctx.blocks, ctx.assignments, 4)
    .filter((b) => !usedPrimaryIds.has(b.id));

  const signalBlock    = makeBlock(`${ctx.truthKey}:signal`,      "signal",      "Signal",      signalSrc,   supportSrcs.slice(0, 2));
  const ruleBlock      = makeBlock(`${ctx.truthKey}:rule`,        "rule",        "Rule",        ruleSrc,     supportSrcs.slice(0, 1));
  const mechanismBlock = makeBlock(`${ctx.truthKey}:mechanism`,   "mechanism",   "Mechanism",   mechSrc,     supportSrcs.slice(0, 1));
  // Action falls back to ruleSrc; if rule and signal are the same sentence
  // the text will be deduplicated later in finalizeStory.
  const actionBlock    = makeActionBlock(`${ctx.truthKey}:action`, ruleSrc, supportSrcs[0] ?? null);
  const trapBlock      = makeBlock(`${ctx.truthKey}:trap`,        "trap",        "Trap",        trapSrc,     []);
  const bottomLineBlock = makeBottomLine(`${ctx.truthKey}:bottom-line`, btmSrc, signalSrc, ruleSrc);

  const supportBlocks = supportSrcs
    .map((src, idx) => makeBlock(`${ctx.truthKey}:support:${idx}`, "mechanism", "Support", src, []))
    .filter((b): b is StoryBlockV2 => b !== null);

  return {
    truthKey:    ctx.truthKey,
    documentId:  ctx.documentId,
    pageNumber:  ctx.pageNumber,
    pageClass:   ctx.pageClass,
    sourceBlocks: ctx.blocks,
    readingOrder: orderBlocks({ signalBlock, ruleBlock, mechanismBlock, actionBlock, trapBlock, bottomLineBlock }),
    signalBlock,
    ruleBlock,
    mechanismBlock,
    actionBlock,
    trapBlock,
    bottomLineBlock,
    supportBlocks,
    paragraphRoles: ctx.assignments,
  };
}

// ---------------------------------------------------------------------------
// Block builders
// ---------------------------------------------------------------------------

function makeBlock(
  id: string,
  kind: StoryBlockKindV2,
  title: string,
  primary: NormalizedPageBlock | null,
  support: NormalizedPageBlock[],
): StoryBlockV2 | null {
  if (!primary) return null;
  const text = bestCompleteSentence(primary.text);
  if (!text) return null;

  // sentenceSafeSupport deduplicates and validates each support sentence
  const supportTexts = sentenceSafeSupport(
    support.map((b) => b.text).filter((t) => t !== primary.text),
    3,
  );

  return {
    id,
    kind,
    title,
    text,
    support: supportTexts,
    evidence: makeEvidence([primary, ...support]),
    confidence: normalizeScore(primary.score),
  };
}

function makeActionBlock(
  id: string,
  ruleSrc: NormalizedPageBlock | null,
  fallback: NormalizedPageBlock | null,
): StoryBlockV2 | null {
  const src = ruleSrc ?? fallback;
  if (!src) return null;
  const text = bestCompleteSentence(src.text);
  if (!text) return null;
  return {
    id,
    kind: "action",
    title: "Action",
    text,
    support: [],
    evidence: makeEvidence([src]),
    confidence: normalizeScore(src.score),
  };
}

function makeBottomLine(
  id: string,
  explicit: NormalizedPageBlock | null,
  signal: NormalizedPageBlock | null,
  rule: NormalizedPageBlock | null,
): StoryBlockV2 | null {
  // Prefer an explicit bottom_line block
  if (explicit) {
    const text = bestCompleteSentence(explicit.text);
    if (text) {
      return {
        id,
        kind: "bottom_line",
        title: "Bottom line",
        text,
        support: [],
        evidence: makeEvidence([explicit]),
        confidence: normalizeScore(explicit.score),
      };
    }
  }
  // Conservative fallback — rule, then signal
  const src = rule ?? signal;
  if (!src) return null;
  const text = bestCompleteSentence(src.text);
  if (!text) return null;
  return {
    id,
    kind: "bottom_line",
    title: "Bottom line",
    text,
    support: [],
    evidence: makeEvidence([src]),
    confidence: normalizeScore(src.score),
  };
}

// ---------------------------------------------------------------------------
// Finalization — deduplication
// ---------------------------------------------------------------------------

function finalizeStory(story: Omit<PageStoryV2, "highlights" | "paragraphNotes">): Omit<PageStoryV2, "highlights" | "paragraphNotes"> {
  const seen = new Map<string, string>();
  const major: Array<StoryBlockV2 | null> = [
    story.signalBlock,
    story.ruleBlock,
    story.mechanismBlock,
    story.actionBlock,
    story.trapBlock,
    story.bottomLineBlock,
  ];

  const deduped = major.map((block): StoryBlockV2 | null => {
    if (!block) return null;
    const key = canonicalTextKey(block.text);
    if (seen.has(key)) return null;
    seen.set(key, block.id);
    return block;
  });

  const [signalBlock, ruleBlock, mechanismBlock, actionBlock, trapBlock, bottomLineBlock] = deduped;

  return {
    ...story,
    signalBlock,
    ruleBlock,
    mechanismBlock,
    actionBlock,
    trapBlock,
    bottomLineBlock,
    readingOrder: orderBlocks({ signalBlock, ruleBlock, mechanismBlock, actionBlock, trapBlock, bottomLineBlock }),
    supportBlocks: dedupeBlocks(story.supportBlocks),
  };
}

// ---------------------------------------------------------------------------
// Highlight mapping
// ---------------------------------------------------------------------------

function mapStoryToHighlights(story: Omit<PageStoryV2, "highlights" | "paragraphNotes">): StoryHighlight[] {
  const out: StoryHighlight[] = [];
  if (story.signalBlock)    out.push({ blockId: story.signalBlock.id,    priority: "main",    semanticKind: "signal" });
  if (story.mechanismBlock) out.push({ blockId: story.mechanismBlock.id, priority: "main",    semanticKind: "mechanism" });
  if (story.ruleBlock)      out.push({ blockId: story.ruleBlock.id,      priority: "support", semanticKind: "support" });
  for (const b of story.supportBlocks)  out.push({ blockId: b.id, priority: "support", semanticKind: "support" });
  if (story.trapBlock)      out.push({ blockId: story.trapBlock.id,      priority: "weak",    semanticKind: "trap" });
  return out;
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

function topBlockForRole(
  role: ParagraphRoleV2,
  blocks: NormalizedPageBlock[],
  assignments: ParagraphRoleAssignment[],
): NormalizedPageBlock | null {
  const match = assignments
    .filter((a) => a.role === role)
    .sort((a, b) => b.score - a.score)[0];
  if (!match) return null;
  return blocks.find((b) => b.id === match.blockId) ?? null;
}

function topBlocksForRoles(
  roles: ParagraphRoleV2[],
  blocks: NormalizedPageBlock[],
  assignments: ParagraphRoleAssignment[],
  limit: number,
): NormalizedPageBlock[] {
  const roleSet = new Set(roles);
  return assignments
    .filter((a) => roleSet.has(a.role))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((a) => blocks.find((b) => b.id === a.blockId))
    .filter((b): b is NormalizedPageBlock => Boolean(b));
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function normalizeScore(score: number): number {
  return Math.max(0.1, Math.min(1, score / 10));
}

function dedupeBlocks(blocks: StoryBlockV2[]): StoryBlockV2[] {
  const seen = new Set<string>();
  return blocks.filter((b) => {
    const key = canonicalTextKey(b.text);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function makeEvidence(blocks: NormalizedPageBlock[]): StoryEvidenceV2[] {
  return blocks.map((b) => ({
    blockId: b.id,
    text: b.text,
    paragraphIndex: b.blockIndex,
    score: b.score,
    bbox: b.bbox,
  }));
}

function orderBlocks(args: {
  signalBlock:    StoryBlockV2 | null;
  ruleBlock:      StoryBlockV2 | null;
  mechanismBlock: StoryBlockV2 | null;
  actionBlock:    StoryBlockV2 | null;
  trapBlock:      StoryBlockV2 | null;
  bottomLineBlock: StoryBlockV2 | null;
}): string[] {
  return [
    args.signalBlock?.id,
    args.ruleBlock?.id,
    args.mechanismBlock?.id,
    args.actionBlock?.id,
    args.trapBlock?.id,
    args.bottomLineBlock?.id,
  ].filter((id): id is string => Boolean(id));
}
