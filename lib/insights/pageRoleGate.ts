// lib/insights/pageRoleGate.ts
// Stabilization fix — canonical noninstructional-page gate.
//
// Before this file existed, three independent, hand-maintained role
// block-lists disagreed with each other:
//   - lib/right-panel/extractPageSignals.ts's BLOCKED_ROLES_SET (13 roles,
//     diagnostic-log-only, never actually gated anything).
//   - lib/useActivePageIntelligence.ts's inline 6-role list (drove
//     `limitedEvidence` for the older study-model panel).
//   - pages/index.tsx's NON_INSTRUCTIONAL_ROLES (16 roles — the most
//     complete of the three; gated the legacy ExpertAnchor/LeftPanel
//     pipeline, but NOT the Surgeon annotation pipeline that actually
//     drives the PDF overlay, Professor, Whiteboard, and Recall).
//
// This is now the one shared definition. It does not change what
// lib/right-panel/extractPageSignals.ts's detectPageRole() classifies a
// page AS — that classifier is unchanged — it only reconciles which of
// those classifications count as "don't generate instructional content
// for this page."
//
// pages/index.tsx's 16-role list is the base: it was the most carefully
// considered of the three (the only one built specifically to gate a
// real content-generation pipeline, not just a diagnostic). "history_background"
// is deliberately NOT included — it was never in any of the three lists as an
// active gate, and reclassifying it is out of scope for a stabilization fix.

import type { PageRole } from "@/lib/readerContracts";

export const NONINSTRUCTIONAL_PAGE_ROLES: ReadonlySet<PageRole> = new Set<PageRole>([
  "cover",
  "title_page",
  "dedication",
  "acknowledgements",
  "preface",
  "about_authors",
  "copyright_frontmatter",
  "contents",
  "unit_opener",
  "section_opener",
  "glossary",
  "index",
  "bibliography",
  "appendix",
  "image_scan_heavy",
  "chapter_opener",
  "learning_objectives",
]);

/**
 * True when a page's role means it should not generate advanced
 * annotations, Professor lessons, Whiteboard content, or Recall cards.
 * The single shared gate every content-generation surface should consult
 * — in practice only the Surgeon annotation pipeline
 * (components/reader/useSurgeonAnnotations.ts) needs to call this
 * directly, since Professor/Whiteboard/Recall all derive their evidence
 * from Surgeon's output rather than re-classifying the page themselves.
 */
export function isNoninstructionalPage(pageRole: PageRole | string | null | undefined): boolean {
  if (!pageRole) return false;
  return NONINSTRUCTIONAL_PAGE_ROLES.has(pageRole as PageRole);
}
