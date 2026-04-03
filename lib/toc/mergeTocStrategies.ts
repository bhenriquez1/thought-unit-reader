import type { SemanticHeading } from "@/lib/pdf/inferHeadings";
import type { FallbackTocItem } from "./buildFallbackToc";
import { buildFallbackToc } from "./buildFallbackToc";

export type NativeTocItem = {
  id: string;
  title: string;
  page: number;
  level: number;
  children?: NativeTocItem[];
};

export type UnifiedTocItem = {
  id: string;
  title: string;
  page: number;
  level: number;
  source: "native" | "semantic_heading" | "synthetic_anchor" | "merged";
  confidence: number;
  children: UnifiedTocItem[];
};

export type UnifiedTocResult = {
  items: UnifiedTocItem[];
  strategy:
    | "native_only"
    | "native_plus_semantic"
    | "semantic_plus_fallback"
    | "fallback_only"
    | "empty";
  confidence: number;
  warnings: string[];
  diagnostics: {
    nativeCount: number;
    semanticCount: number;
    fallbackCount: number;
    usedNative: boolean;
    usedSemantic: boolean;
    usedFallback: boolean;
  };
};

type MergeTocStrategiesArgs = {
  nativeOutline?: NativeTocItem[] | null;
  semanticHeadings?: SemanticHeading[];
  totalPages?: number;
  includeSyntheticAnchors?: boolean;
  syntheticPageInterval?: number;
};

export function mergeTocStrategies({
  nativeOutline,
  semanticHeadings = [],
  totalPages,
  includeSyntheticAnchors = true,
  syntheticPageInterval = 25,
}: MergeTocStrategiesArgs): UnifiedTocResult {
  const warnings: string[] = [];

  const nativeItems = normalizeNativeOutline(nativeOutline || []);
  const nativeConfidence = estimateNativeConfidence(nativeItems);

  const fallback = buildFallbackToc({
    headings: semanticHeadings,
    totalPages,
    includeSyntheticAnchors,
    syntheticPageInterval,
  });

  const semanticLikeItems = flattenFallbackItems(fallback.items).filter(
    (item) => item.source !== "synthetic_anchor",
  );

  const hasStrongNative = nativeItems.length > 0 && nativeConfidence >= 0.55;
  const hasStrongSemantic = semanticLikeItems.length > 0 && fallback.confidence >= 0.4;
  const hasFallback = fallback.items.length > 0;

  if (hasStrongNative && !hasStrongSemantic) {
    return {
      items: nativeItems,
      strategy: "native_only",
      confidence: nativeConfidence,
      warnings,
      diagnostics: {
        nativeCount: countUnifiedItems(nativeItems),
        semanticCount: semanticLikeItems.length,
        fallbackCount: flattenFallbackItems(fallback.items).length,
        usedNative: true,
        usedSemantic: false,
        usedFallback: false,
      },
    };
  }

  if (hasStrongNative && hasStrongSemantic) {
    const merged = mergeNativeWithSemantic(nativeItems, semanticLikeItems, warnings);

    return {
      items: merged,
      strategy: "native_plus_semantic",
      confidence: clamp(nativeConfidence * 0.65 + fallback.confidence * 0.25 + 0.1, 0, 1),
      warnings,
      diagnostics: {
        nativeCount: countUnifiedItems(nativeItems),
        semanticCount: semanticLikeItems.length,
        fallbackCount: flattenFallbackItems(fallback.items).length,
        usedNative: true,
        usedSemantic: true,
        usedFallback: false,
      },
    };
  }

  if (!hasStrongNative && hasFallback) {
    warnings.push(...fallback.warnings);

    return {
      items: fallbackItemsToUnified(fallback.items),
      strategy:
        fallback.strategy === "semantic_only" || fallback.strategy === "semantic_plus_synthetic"
          ? "semantic_plus_fallback"
          : "fallback_only",
      confidence: fallback.confidence,
      warnings,
      diagnostics: {
        nativeCount: countUnifiedItems(nativeItems),
        semanticCount: semanticLikeItems.length,
        fallbackCount: flattenFallbackItems(fallback.items).length,
        usedNative: false,
        usedSemantic: semanticLikeItems.length > 0,
        usedFallback: true,
      },
    };
  }

  return {
    items: [],
    strategy: "empty",
    confidence: 0,
    warnings: ["No TOC strategy produced usable navigation anchors."],
    diagnostics: {
      nativeCount: countUnifiedItems(nativeItems),
      semanticCount: semanticLikeItems.length,
      fallbackCount: flattenFallbackItems(fallback.items).length,
      usedNative: false,
      usedSemantic: false,
      usedFallback: false,
    },
  };
}

function normalizeNativeOutline(items: NativeTocItem[]): UnifiedTocItem[] {
  const normalized = items
    .map((item, index) => normalizeNativeItem(item, index, 1))
    .filter((item): item is UnifiedTocItem => item !== null);

  return sortUnifiedItems(normalized);
}

function normalizeNativeItem(
  item: NativeTocItem,
  index: number,
  fallbackLevel: number,
): UnifiedTocItem | null {
  if (!item.title?.trim()) return null;
  if (!Number.isFinite(item.page) || item.page <= 0) return null;

  const level = clamp(Math.round(item.level || fallbackLevel), 1, 6);
  const children = (item.children || [])
    .map((child, childIndex) => normalizeNativeItem(child, childIndex, level + 1))
    .filter((child): child is UnifiedTocItem => child !== null);

  return {
    id: item.id || `native-${index}-${canonicalize(item.title)}`,
    title: cleanTitle(item.title),
    page: item.page,
    level,
    source: "native",
    confidence: 0.9,
    children: sortUnifiedItems(children),
  };
}

function estimateNativeConfidence(items: UnifiedTocItem[]): number {
  const flat = flattenUnifiedItems(items);
  if (!flat.length) return 0;

  let score = 0.5;

  const hasHierarchy = flat.some((item) => item.level > 1);
  const titleQuality =
    flat.filter((item) => item.title.length >= 3 && item.title.length <= 140).length /
    flat.length;

  if (hasHierarchy) score += 0.15;
  score += titleQuality * 0.2;

  const uniquePages = new Set(flat.map((item) => item.page)).size;
  if (uniquePages >= 3) score += 0.1;

  return clamp(score, 0, 1);
}

function mergeNativeWithSemantic(
  nativeItems: UnifiedTocItem[],
  semanticItems: FallbackTocItem[],
  warnings: string[],
): UnifiedTocItem[] {
  const merged = cloneUnifiedTree(nativeItems);
  const flatNative = flattenUnifiedItems(merged);

  const unmatchedSemantic: FallbackTocItem[] = [];

  for (const semantic of semanticItems) {
    const match = findBestNativeMatch(flatNative, semantic);
    if (!match) {
      unmatchedSemantic.push(semantic);
      continue;
    }

    if (shouldEnrichTitle(match.title, semantic.title)) {
      match.title = chooseBetterTitle(match.title, semantic.title);
      match.source = "merged";
      match.confidence = clamp(Math.max(match.confidence, semantic.score), 0, 1);
    }
  }

  if (unmatchedSemantic.length > 0) {
    warnings.push(
      `Added ${unmatchedSemantic.length} inferred heading anchor${unmatchedSemantic.length === 1 ? "" : "s"} not present in the native outline.`,
    );

    const extraItems = fallbackItemsToUnified(buildHierarchyFromFlatFallback(unmatchedSemantic));

    return sortUnifiedItems([...merged, ...extraItems]);
  }

  return sortUnifiedItems(merged);
}

function findBestNativeMatch(
  nativeItems: UnifiedTocItem[],
  semantic: FallbackTocItem,
): UnifiedTocItem | null {
  let best: UnifiedTocItem | null = null;
  let bestScore = 0;

  for (const native of nativeItems) {
    const pageDistance = Math.abs(native.page - semantic.page);
    if (pageDistance > 2) continue;

    const titleSimilarity = stringSimilarity(native.title, semantic.title);
    const levelPenalty = Math.abs(native.level - semantic.level) * 0.08;
    const score = titleSimilarity - levelPenalty - pageDistance * 0.12;

    if (score > bestScore) {
      best = native;
      bestScore = score;
    }
  }

  return bestScore >= 0.45 ? best : null;
}

function shouldEnrichTitle(nativeTitle: string, semanticTitle: string): boolean {
  const nativeClean = canonicalize(nativeTitle);
  const semanticClean = canonicalize(semanticTitle);

  if (nativeClean === semanticClean) return false;
  if (nativeTitle.length >= semanticTitle.length) return false;
  if (stringSimilarity(nativeTitle, semanticTitle) < 0.55) return false;

  return true;
}

function chooseBetterTitle(nativeTitle: string, semanticTitle: string): string {
  return semanticTitle.length > nativeTitle.length ? semanticTitle : nativeTitle;
}

function fallbackItemsToUnified(items: FallbackTocItem[]): UnifiedTocItem[] {
  return items.map((item) => ({
    id: item.id,
    title: cleanTitle(item.title),
    page: item.page,
    level: clamp(item.level, 1, 6),
    source: item.source,
    confidence: clamp(item.score, 0, 1),
    children: fallbackItemsToUnified(item.children || []),
  }));
}

function flattenFallbackItems(items: FallbackTocItem[]): FallbackTocItem[] {
  const result: FallbackTocItem[] = [];

  for (const item of items) {
    result.push(item);
    if (item.children?.length) {
      result.push(...flattenFallbackItems(item.children));
    }
  }

  return result;
}

function flattenUnifiedItems(items: UnifiedTocItem[]): UnifiedTocItem[] {
  const result: UnifiedTocItem[] = [];

  for (const item of items) {
    result.push(item);
    if (item.children?.length) {
      result.push(...flattenUnifiedItems(item.children));
    }
  }

  return result;
}

function cloneUnifiedTree(items: UnifiedTocItem[]): UnifiedTocItem[] {
  return items.map((item) => ({
    ...item,
    children: cloneUnifiedTree(item.children || []),
  }));
}

function buildHierarchyFromFlatFallback(items: FallbackTocItem[]): FallbackTocItem[] {
  const sorted = [...items]
    .map((item) => ({ ...item, children: [] as FallbackTocItem[] }))
    .sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      if (a.level !== b.level) return a.level - b.level;
      return a.title.localeCompare(b.title);
    });

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

    stack[stack.length - 1].children.push(item);
    stack.push(item);
  }

  return roots;
}

function sortUnifiedItems(items: UnifiedTocItem[]): UnifiedTocItem[] {
  return [...items]
    .sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      if (a.level !== b.level) return a.level - b.level;
      return a.title.localeCompare(b.title);
    })
    .map((item) => ({
      ...item,
      children: sortUnifiedItems(item.children || []),
    }));
}

function countUnifiedItems(items: UnifiedTocItem[]): number {
  return flattenUnifiedItems(items).length;
}

function cleanTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim();
}

function canonicalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function stringSimilarity(a: string, b: string): number {
  const aa = canonicalize(a);
  const bb = canonicalize(b);

  if (!aa || !bb) return 0;
  if (aa === bb) return 1;
  if (aa.includes(bb) || bb.includes(aa)) return 0.82;

  const aWords = new Set(aa.split(" "));
  const bWords = new Set(bb.split(" "));

  const intersection = [...aWords].filter((word) => bWords.has(word)).length;
  const union = new Set([...aWords, ...bWords]).size;

  if (!union) return 0;
  return intersection / union;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
