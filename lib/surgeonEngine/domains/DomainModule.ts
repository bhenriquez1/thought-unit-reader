// lib/surgeonEngine/domains/DomainModule.ts
// Plugin interface for optional domain-specific enrichment (PR4C).
// Modules MUST NOT break general books — they only add tags/signals.

import type { ParagraphUnit, AnchoredItem } from '../../page-intelligence/types';

/**
 * Context provided to isApplicable() so modules can self-determine
 * whether the current document is in their domain.
 */
export interface DomainContext {
  /** Document title (if available) */
  title?: string;
  /** Table-of-contents headings from the first N pages */
  toc?: string[];
  /** High-frequency keywords from the first 5 pages */
  keywords?: string[];
}

/**
 * A DomainModule adds domain-specific tags and role enhancements to
 * paragraph units and output items. It must:
 *  1. Return false from isApplicable() when the document is out of domain.
 *  2. Never mutate the original objects — always return shallow copies.
 *  3. Only add tags; never change role/importance drastically.
 */
export interface DomainModule {
  /** Unique module identifier (e.g. "oral-path", "perio", "universal") */
  id: string;
  /** Human-readable label */
  label: string;

  /**
   * Returns true if this module should be activated for the given document.
   * Called once at document load. Return false for non-matching books.
   */
  isApplicable(ctx: DomainContext): boolean;

  /**
   * Enrich a ParagraphUnit with domain-specific tags / adjusted importance.
   * Return a modified copy; do NOT mutate the original.
   */
  enrichParagraph(p: ParagraphUnit): ParagraphUnit;

  /**
   * Enrich an AnchoredItem with domain-specific tags.
   * Return a modified copy; do NOT mutate the original.
   */
  enrichItem(i: AnchoredItem): AnchoredItem;
}

// ============================================================================
// Module registry
// ============================================================================

const _registry: Map<string, DomainModule> = new Map();

export function registerDomainModule(module: DomainModule): void {
  _registry.set(module.id, module);
}

export function getApplicableModules(ctx: DomainContext): DomainModule[] {
  return Array.from(_registry.values()).filter(m => m.isApplicable(ctx));
}

export function applyDomainEnrichment(
  units: ParagraphUnit[],
  items: AnchoredItem[],
  ctx: DomainContext,
): { units: ParagraphUnit[]; items: AnchoredItem[] } {
  const modules = getApplicableModules(ctx);
  if (modules.length === 0) return { units, items };

  const enrichedUnits = units.map(u =>
    modules.reduce<ParagraphUnit>((acc, m) => m.enrichParagraph(acc), u)
  );
  const enrichedItems = items.map(i =>
    modules.reduce<AnchoredItem>((acc, m) => m.enrichItem(acc), i)
  );

  return { units: enrichedUnits, items: enrichedItems };
}
