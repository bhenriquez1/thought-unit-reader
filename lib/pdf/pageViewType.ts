// lib/pdf/pageViewType.ts
// Explicit page-type labels derived from the existing classification layer.

import type { PageContentClass } from "@/lib/pdf/classifyPageContent";
import type { ClinicalNormalizationResult } from "@/lib/normalization/normalizeClinicalText";

export type PageViewType =
  | "chapter_opener"   // chapter title/intro — no detailed highlights, show chapter preview
  | "figure_page"      // image/diagram dominant — no text to anchor
  | "table_page"       // data table — structured, not narrative
  | "form_page"        // checklist / clinical form
  | "content_page"     // standard instructional prose — full highlights
  | "sparse_page";     // insufficient text for any meaningful extraction

export function derivePageViewType(
  pageClass: PageContentClass | null,
  normResult: ClinicalNormalizationResult | null,
): PageViewType {
  const pageKind = normResult?.pageKind ?? "insufficient_prose";

  // chapter_title and section_title = empty/outline pages → suppress
  // chapter_intro = has real body prose → allow extraction (content_page)
  if (pageKind === "chapter_title" || pageKind === "section_title") return "chapter_opener";

  if (
    pageKind === "image_only" ||
    pageKind === "diagram_only" ||
    pageKind === "graph_only" ||
    pageClass === "image_only" ||
    pageClass === "mixed_visual"
  ) return "figure_page";

  if (pageKind === "table_heavy" || pageClass === "table_heavy") return "table_page";

  if (pageKind === "questionnaire_form" || pageClass === "form_page") return "form_page";

  if (
    pageKind === "front_matter" ||
    pageKind === "insufficient_prose" ||
    pageClass === "sparse_text" ||
    pageClass === "failed_sparse" ||
    pageClass === "copyright_frontmatter"
  ) return "sparse_page";

  return "content_page";
}

/** True when the page type should suppress all highlights. */
export function pageSuppressesHighlights(viewType: PageViewType): boolean {
  return viewType === "chapter_opener" || viewType === "figure_page" || viewType === "sparse_page";
}
