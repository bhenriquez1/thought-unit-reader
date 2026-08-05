// lib/insights/buildSurgeonAnnotationInput.ts
// Assembles the request body for pages/api/page-annotation-plan.ts.
//
// This is the fix for the staleness bug confirmed in synthesizeTeachingOutput.ts's
// buildUserPrompt(): that pipeline feeds pageThesis/pageObjective/pageSummary —
// locally-derived summaries of the SAME page — back into OpenAI as primary context.
// This builder's output NEVER contains those fields. OpenAI must read the current
// page fresh from its image + raw text; existingCanonicalUnits may appear only as
// light continuity context, explicitly labeled as such downstream in the prompt.

import type { PageDomain } from "@/lib/insights/detectPageDomain";
import type { SemanticPack } from "@/lib/semantic/types";
import { resolvePageHeading, sanitizeTitle } from "@/lib/page-intelligence/titleResolution";
import { cleanActivePageText } from "@/lib/insights/cleanActivePageText";
import { splitIntoParagraphs } from "@/lib/highlights/groundHighlightAnchors";
import { extractPageBlocks, type PageBlock } from "@/lib/insights/extractPageBlocks";
import { computePageContentHash } from "@/lib/insights/pageContentHash";

export interface ExistingCanonicalUnitContext {
  id: string;
  text: string;
  canonicalType?: string;
}

export interface SurgeonAnnotationInput {
  pageTruthKey: string;
  /** Identifies which document this page belongs to — the same value used to
   *  build pageTruthKey, sent as its own field so pageContentHash's identity
   *  components are explicit rather than implicit in a composite string. */
  documentId: string;
  pageNumber: number;
  /** Content-derived integrity key for THIS request — see pageContentHash.ts.
   *  Echoed back unchanged by the API; the caller re-derives its own current
   *  value at response time and discards a mismatch. */
  pageContentHash: string;
  pageImageDataUrl: string | null;
  pageText: string;
  paragraphs: string[];
  /** Structured, typed, reading-order decomposition of pageText — sent
   *  instead of relying on the model to notice headings/tables/lists buried
   *  in a flat blob. Never AI-generated; a pure classification of the same
   *  verbatim text. */
  blocks: PageBlock[];
  headings: {
    current: string;
    previous: string | null;
    next: string | null;
  };
  domain: PageDomain;
  /** Trimmed projection of the active SemanticPack — sent as a real object, not
   *  just a preset id string. */
  semanticPack: {
    id: string;
    label: string;
    promptInstructions: string[];
    labels: Array<{ canonicalType: string; label: string; shortLabel: string }>;
  };
  /** Light continuity context only — never the primary description of the page. */
  existingCanonicalUnits: ExistingCanonicalUnitContext[];
}

/** Best-effort heading for a page from its raw extracted text — the first
 *  substantial cleaned line. Used for both the current page and its neighbors. */
function deriveHeadingFromPageText(pageText: string | null | undefined): string | null {
  if (!pageText) return null;
  const cleaned = cleanActivePageText(pageText, "surgeon-heading");
  const firstLine = cleaned.split(/\n/).map(l => l.trim()).find(l => l.length > 0);
  if (!firstLine) return null;
  const sanitized = sanitizeTitle(firstLine, "");
  return sanitized || null;
}

function projectSemanticPack(pack: SemanticPack): SurgeonAnnotationInput["semanticPack"] {
  return {
    id:                 pack.id,
    label:              pack.label,
    promptInstructions: pack.promptInstructions,
    labels:             pack.labels.map(l => ({
      canonicalType: l.canonicalType,
      label:         l.label,
      shortLabel:    l.shortLabel,
    })),
  };
}

export function buildSurgeonAnnotationInput(args: {
  pageTruthKey: string;
  documentId: string;
  pageNumber: number;
  pageImageDataUrl: string | null;
  pageText: string;
  previousPageText?: string | null;
  nextPageText?: string | null;
  domain: PageDomain;
  semanticPack: SemanticPack;
  existingCanonicalUnits: ExistingCanonicalUnitContext[];
}): SurgeonAnnotationInput {
  const cleanedPageText = cleanActivePageText(args.pageText, "surgeon-input");

  return {
    pageTruthKey:     args.pageTruthKey,
    documentId:       args.documentId,
    pageNumber:       args.pageNumber,
    pageContentHash:  computePageContentHash(args.documentId, args.pageNumber, cleanedPageText),
    pageImageDataUrl: args.pageImageDataUrl ?? null,
    pageText:         cleanedPageText,
    paragraphs:       splitIntoParagraphs(cleanedPageText),
    blocks:           extractPageBlocks(cleanedPageText),
    headings: {
      current:  resolvePageHeading([deriveHeadingFromPageText(args.pageText)], "Current Page"),
      previous: deriveHeadingFromPageText(args.previousPageText),
      next:     deriveHeadingFromPageText(args.nextPageText),
    },
    domain:                 args.domain,
    semanticPack:           projectSemanticPack(args.semanticPack),
    existingCanonicalUnits: args.existingCanonicalUnits.slice(0, 20),
  };
}
