// lib/insights/studyModelCache.ts
// Session-scoped cache for page intelligence results.
//
// Keyed by documentId::pageNumber::textHash so it automatically invalidates
// when the page text changes. The anchor cache is keyed by
// documentId::pageNumber::requestKey and stores computed highlight
// neighborhoods so the left panel never recomputes them on back-navigation.
//
// Both caches live in module-level Maps (survive React re-renders, reset on
// full page refresh). Call clearDocumentCache() when a new document loads.

import type { PageInsightModel } from "@/lib/insights/types";
import type { ClinicalNormalizationResult } from "@/lib/normalization/normalizeClinicalText";
import type { PageContentClass } from "@/lib/pdf/classifyPageContent";
import type { HighlightNeighborhood } from "@/lib/highlights/buildHighlightNeighborhoods";

export interface ModelCacheEntry {
  pageModel:   PageInsightModel;
  normResult:  ClinicalNormalizationResult;
  pageClass:   PageContentClass;
  confidence:  number;
  textHash:    string;
  timestamp:   number;
  /** Always "local_nlp" — confirms which pipeline generated this entry. */
  generatedBy: "local_nlp";
}

const MAX_MODEL_ENTRIES = 150;
const _modelCache  = new Map<string, ModelCacheEntry>();
const _anchorCache = new Map<string, HighlightNeighborhood[]>();

// ── Key helpers ──────────────────────────────────────────────────────────────

export function makeModelCacheKey(
  documentId: string,
  pageNumber: number,
  textHash:   string,
): string {
  return `${documentId}::${pageNumber}::${textHash}`;
}

export function makeAnchorCacheKey(
  documentId:  string,
  pageNumber:  number,
  requestKey:  string,
): string {
  return `${documentId}::${pageNumber}::${requestKey}`;
}

// ── Model cache ───────────────────────────────────────────────────────────────

export function getModelCacheEntry(key: string): ModelCacheEntry | undefined {
  return _modelCache.get(key);
}

export function setModelCacheEntry(key: string, entry: ModelCacheEntry): void {
  if (_modelCache.size >= MAX_MODEL_ENTRIES) {
    const oldest = [..._modelCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(0, Math.floor(MAX_MODEL_ENTRIES / 3));
    for (const [k] of oldest) _modelCache.delete(k);
  }
  _modelCache.set(key, entry);
}

// ── Anchor cache ──────────────────────────────────────────────────────────────

export function getAnchorCacheEntry(key: string): HighlightNeighborhood[] | undefined {
  return _anchorCache.get(key);
}

export function setAnchorCacheEntry(key: string, anchors: HighlightNeighborhood[]): void {
  _anchorCache.set(key, anchors);
}

// ── Document-level invalidation ───────────────────────────────────────────────

export function clearDocumentCache(documentId: string): void {
  const prefix = `${documentId}::`;
  for (const key of [..._modelCache.keys()]) {
    if (key.startsWith(prefix)) _modelCache.delete(key);
  }
  for (const key of [..._anchorCache.keys()]) {
    if (key.startsWith(prefix)) _anchorCache.delete(key);
  }
}

export function cacheStats(): { models: number; anchors: number } {
  return { models: _modelCache.size, anchors: _anchorCache.size };
}

// ── Confidence scoring ────────────────────────────────────────────────────────

/**
 * Heuristic confidence score 0–1 for a page + normalization result.
 *
 *  0.0  — non-renderable (title pages, image-only, insufficient text)
 *  < 0.5 — low quality (sparse text, mostly sidebars, checkpoint-only)
 *  ≥ 0.5 — acceptable study content
 *  1.0  — rich instructional prose with many insights
 */
export function computePageConfidence(
  pageModel:  PageInsightModel,
  normResult: ClinicalNormalizationResult,
): number {
  if (!normResult.shouldRenderFullPanel) return 0;

  const insights     = pageModel.paragraphInsights ?? [];
  const hasSummary   = (pageModel.pageSummary?.length ?? 0) > 40;
  const insightScore = Math.min(1, insights.length / 6);
  const summaryBonus = hasSummary ? 0.15 : 0;
  const kindBonus    = [
    "instructional_prose",
    "clinical_narrative",
    "scientific_exposition",
    "mathematical_exposition",
  ].includes(normResult.pageKind) ? 0.25 : 0;

  return Math.min(1, insightScore * 0.60 + summaryBonus + kindBonus);
}
