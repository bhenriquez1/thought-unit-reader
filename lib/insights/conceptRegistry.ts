// lib/insights/conceptRegistry.ts
// Session-level concept memory — accumulates concepts seen across pages.
// Used by buildCrossLinkHints (Layer 2) to surface prerequisite connections
// between the current page and concepts introduced on earlier pages.
//
// Storage: React useRef (survives re-renders, not persisted to disk).

import type { ConceptRole } from "./extractConceptBlocks";
import type { PageDomain } from "./detectPageDomain";

export interface ConceptRegistryEntry {
  title: string;
  role: ConceptRole;
  pageNumber: number;
  domain: PageDomain;
  anchorText: string;
}

// key = normalize(title).slice(0, 40)
export type ConceptRegistry = Map<string, ConceptRegistryEntry[]>;

export function normalizeRegistryKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
}

export function registerConcepts(
  registry: ConceptRegistry,
  pageNumber: number,
  domain: PageDomain,
  concepts: Array<{ title: string; conceptRole: ConceptRole; anchorSentence: string }>,
): void {
  for (const c of concepts) {
    const key = normalizeRegistryKey(c.title);
    if (!key) continue;
    const entry: ConceptRegistryEntry = {
      title: c.title,
      role: c.conceptRole,
      pageNumber,
      domain,
      anchorText: c.anchorSentence.slice(0, 120),
    };
    const existing = registry.get(key) ?? [];
    // Only register if this page isn't already recorded for this concept
    if (!existing.some((e) => e.pageNumber === pageNumber)) {
      existing.push(entry);
      registry.set(key, existing);
    }
  }
}
