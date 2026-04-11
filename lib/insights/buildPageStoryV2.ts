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
import { cleanBlockText, isCompleteSentence } from "./textCleanup";

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

  const finalizedStory = finalizeStory(baseStory);
  const highlights     = mapStoryToHighlights(finalizedStory);

  return { ...finalizedStory, highlights };
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

function synthesizeStory(ctx: SynthesisCtx): Omit<PageStoryV2, "highlights"> {
  const signalSrc    = topBlockForRole("primary_signal", ctx.blocks, ctx.assignments);
  const ruleSrc      = topBlockForRole("decision_rule",  ctx.blocks, ctx.assignments);
  const mechSrc      = topBlockForRole("mechanism",      ctx.blocks, ctx.assignments);
  const trapSrc      = topBlockForRole("trap_warning",   ctx.blocks, ctx.assignments);
  const btmSrc       = topBlockForRole("bottom_line",    ctx.blocks, ctx.assignments);
  const supportSrcs  = topBlocksForRoles(SUPPORT_ROLES,  ctx.blocks, ctx.assignments, 4);

  const signalBlock    = makeBlock(`${ctx.truthKey}:signal`,      "signal",      "Signal",      signalSrc,   supportSrcs.slice(0, 2));
  const ruleBlock      = makeBlock(`${ctx.truthKey}:rule`,        "rule",        "Rule",        ruleSrc,     supportSrcs.slice(0, 1));
  const mechanismBlock = makeBlock(`${ctx.truthKey}:mechanism`,   "mechanism",   "Mechanism",   mechSrc,     supportSrcs.slice(0, 1));
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
  const text = safeSentence(primary.text);
  if (!text) return null;

  const supportTexts = support
    .map((b) => safeSentence(b.text))
    .filter((t): t is string => Boolean(t) && t !== text)
    .slice(0, 3);

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
  const text = safeSentence(src.text);
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
    const text = safeSentence(explicit.text);
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
  const text = safeSentence(src.text);
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

function finalizeStory(story: Omit<PageStoryV2, "highlights">): Omit<PageStoryV2, "highlights"> {
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
    const key = canonical(block.text);
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

function mapStoryToHighlights(story: Omit<PageStoryV2, "highlights">): StoryHighlight[] {
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

function safeSentence(text: string): string | null {
  const cleaned = cleanBlockText(text);
  if (!isCompleteSentence(cleaned)) return null;
  return cleaned;
}

function canonical(text: string): string {
  return cleanBlockText(text).toLowerCase().replace(/\s+/g, " ").slice(0, 100);
}

function normalizeScore(score: number): number {
  return Math.max(0.1, Math.min(1, score / 10));
}

function dedupeBlocks(blocks: StoryBlockV2[]): StoryBlockV2[] {
  const seen = new Set<string>();
  return blocks.filter((b) => {
    const key = canonical(b.text);
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
