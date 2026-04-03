import type { SemanticHeading } from "@/lib/pdf/inferHeadings";

export type FallbackTocItem = {
  id: string;
  title: string;
  page: number;
  level: number;
  score: number;
  source: "semantic_heading" | "synthetic_anchor";
  children: FallbackTocItem[];
};

export type FallbackTocResult = {
  items: FallbackTocItem[];
  confidence: number;
  strategy: "semantic_only" | "semantic_plus_synthetic" | "synthetic_only" | "empty";
  warnings: string[];
};

type BuildFallbackTocArgs = {
  headings: SemanticHeading[];
  totalPages?: number;
  includeSyntheticAnchors?: boolean;
  syntheticPageInterval?: number;
};

export function buildFallbackToc({
  headings,
  totalPages,
  includeSyntheticAnchors = true,
  syntheticPageInterval = 25,
}: BuildFallbackTocArgs): FallbackTocResult {
  const warnings: string[] = [];

  const normalized = normalizeSemanticHeadings(headings);
  const deduped = dedupeHeadings(normalized);
  const filtered = filterWeakHeadings(deduped);

  let sourceItems: FallbackTocItem[] = filtered.map(toFallbackItem);

  if (!sourceItems.length && includeSyntheticAnchors) {
    const synthetic = buildSyntheticAnchors(totalPages, syntheticPageInterval);
    return {
      items: buildHierarchy(synthetic),
      confidence: synthetic.length ? 0.35 : 0,
      strategy: synthetic.length ? "synthetic_only" : "empty",
      warnings: synthetic.length
        ? ["No reliable semantic headings were found; showing page anchors instead."]
        : ["No TOC anchors could be generated."],
    };
  }

  if (!sourceItems.length) {
    return {
      items: [],
      confidence: 0,
      strategy: "empty",
      warnings: ["No heading candidates were strong enough to build a fallback TOC."],
    };
  }

  if (includeSyntheticAnchors && shouldAddSyntheticAnchors(sourceItems, totalPages)) {
    const synthetic = buildSyntheticAnchors(totalPages, syntheticPageInterval);
    if (synthetic.length) {
      sourceItems = mergeWithSyntheticAnchors(sourceItems, synthetic);
      warnings.push(
        "Sparse section coverage detected; supplemental page anchors were added.",
      );
    }
  }

  const hierarchical = buildHierarchy(sourceItems);
  const confidence = estimateTocConfidence(sourceItems, totalPages);

  return {
    items: hierarchical,
    confidence,
    strategy: warnings.length ? "semantic_plus_synthetic" : "semantic_only",
    warnings,
  };
}

function normalizeSemanticHeadings(headings: SemanticHeading[]): SemanticHeading[] {
  return headings
    .map((heading) => ({
      ...heading,
      text: normalizeHeadingText(heading.text),
      level: clamp(Math.round(heading.level || 1), 1, 6),
      score: clamp(heading.score || 0, 0, 1),
    }))
    .filter((heading) => heading.text.length > 0)
    .sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
      if (a.level !== b.level) return a.level - b.level;
      return a.text.localeCompare(b.text);
    });
}

function dedupeHeadings(headings: SemanticHeading[]): SemanticHeading[] {
  const seen = new Set<string>();
  const result: SemanticHeading[] = [];

  for (const heading of headings) {
    const key = [heading.pageNumber, heading.level, canonicalize(heading.text)].join("::");

    if (seen.has(key)) continue;
    seen.add(key);
    result.push(heading);
  }

  return result;
}

function filterWeakHeadings(headings: SemanticHeading[]): SemanticHeading[] {
  return headings.filter((heading) => {
    if (heading.score < 0.5) return false;
    if (looksLikeGarbageHeading(heading.text)) return false;
    return true;
  });
}

function toFallbackItem(heading: SemanticHeading): FallbackTocItem {
  return {
    id: heading.id,
    title: heading.text,
    page: heading.pageNumber,
    level: heading.level,
    score: heading.score,
    source: "semantic_heading",
    children: [],
  };
}

function buildSyntheticAnchors(totalPages?: number, interval = 25): FallbackTocItem[] {
  if (!totalPages || totalPages <= 0) return [];

  const items: FallbackTocItem[] = [];

  for (let page = 1; page <= totalPages; page += interval) {
    items.push({
      id: `synthetic-page-${page}`,
      title: `Page ${page}`,
      page,
      level: 1,
      score: 0.35,
      source: "synthetic_anchor",
      children: [],
    });
  }

  if (items.length && items[items.length - 1].page !== totalPages) {
    items.push({
      id: `synthetic-page-${totalPages}`,
      title: `Page ${totalPages}`,
      page: totalPages,
      level: 1,
      score: 0.35,
      source: "synthetic_anchor",
      children: [],
    });
  }

  return items;
}

function shouldAddSyntheticAnchors(items: FallbackTocItem[], totalPages?: number): boolean {
  if (!totalPages || totalPages < 40) return false;

  const uniquePages = new Set(items.map((item) => item.page)).size;
  const sparseCoverage = uniquePages / totalPages < 0.04;
  const tooFewAnchors = uniquePages < 4;

  return sparseCoverage || tooFewAnchors;
}

function mergeWithSyntheticAnchors(
  semanticItems: FallbackTocItem[],
  syntheticItems: FallbackTocItem[],
): FallbackTocItem[] {
  const merged = [...semanticItems];

  for (const synthetic of syntheticItems) {
    const nearbySemantic = semanticItems.some((item) => Math.abs(item.page - synthetic.page) <= 2);
    if (!nearbySemantic) {
      merged.push(synthetic);
    }
  }

  return merged.sort(compareTocItems);
}

function buildHierarchy(items: FallbackTocItem[]): FallbackTocItem[] {
  if (!items.length) return [];

  const sorted = items
    .map((item) => ({ ...item, children: [] as FallbackTocItem[] }))
    .sort(compareTocItems);

  const roots: FallbackTocItem[] = [];
  const stack: FallbackTocItem[] = [];

  for (const item of sorted) {
    while (stack.length && stack[stack.length - 1].level >= item.level) {
      stack.pop();
    }

    if (!stack.length) {
      roots.push(item);
      stack.push(item);
      continue;
    }

    const parent = stack[stack.length - 1];
    parent.children.push(item);
    stack.push(item);
  }

  return roots;
}

function estimateTocConfidence(items: FallbackTocItem[], totalPages?: number): number {
  if (!items.length) return 0;

  const semanticItems = items.filter((item) => item.source === "semantic_heading");
  const semanticRatio = semanticItems.length / items.length;
  const avgScore =
    semanticItems.length > 0
      ? semanticItems.reduce((sum, item) => sum + item.score, 0) / semanticItems.length
      : 0.35;

  let coverageBoost = 0;
  if (totalPages && totalPages > 0) {
    const uniquePages = new Set(items.map((item) => item.page)).size;
    const coverage = uniquePages / totalPages;
    coverageBoost = Math.min(0.2, coverage * 0.8);
  }

  const confidence = avgScore * 0.65 + semanticRatio * 0.2 + coverageBoost;

  return clamp(confidence, 0, 1);
}

function normalizeHeadingText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\u00ad/g, "")
    .replace(/[\u2010-\u2014]/g, "-")
    .replace(/\s+([:;,.!?])/g, "$1")
    .trim();
}

function canonicalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function looksLikeGarbageHeading(text: string): boolean {
  if (!text) return true;
  if (text.length < 2) return true;
  if (/^page\s+\d+$/i.test(text)) return true;
  if (/^\d+$/.test(text)) return true;
  if (/^(copyright|all rights reserved)$/i.test(text)) return true;
  if (/^(fig(?:ure)?|table|box)\s+\d+/i.test(text)) return true;
  if (text.length > 140) return true;
  return false;
}

function compareTocItems(a: FallbackTocItem, b: FallbackTocItem): number {
  if (a.page !== b.page) return a.page - b.page;
  if (a.level !== b.level) return a.level - b.level;
  return a.title.localeCompare(b.title);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
