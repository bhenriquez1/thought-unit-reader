export type PanelTab = "priority" | "explain" | "relations" | "compare" | "insights";

export type AudienceMode = "student" | "clinical" | "expert";
export type DepthMode = "standard" | "deep";
export type DensityMode = "condensed" | "expanded";

export type PageRole =
  | "cover" | "title_page" | "dedication" | "acknowledgements" | "preface" | "about_authors"
  | "contents" | "copyright_frontmatter"
  | "chapter_opener" | "unit_opener" | "section_opener" | "learning_objectives"
  | "glossary" | "index" | "bibliography" | "appendix"
  | "history_background" | "regular_teaching" | "table_formula" | "image_scan_heavy";

export type PageType =
  | "diagnostic"
  | "definition"
  | "mechanism"
  | "application"
  | "overview"
  | "comparison"
  | "clinical"
  | "formula"
  | "case"
  | "reference"
  | "mixed"
  | "unknown";

export interface FormulaCard {
  raw: string;
  normalized: string;
  speakable: string;
  meaning?: string;
  usage?: string;
  trap?: string;
}

export interface ActivePageContext {
  documentId: string;
  documentTitle?: string;
  pageNumber: number;
  totalPages: number;
  nearbyText?: string;
  activeTopicTitle?: string;
  activeTopicKind?: TocNode["kind"] | null;
  chapterTitle?: string | null;
  sectionTitle?: string | null;
  pageText: string;
  paragraphTexts: string[];
  formulas?: FormulaCard[];
}

export interface RightPanelState {
  activeTab: PanelTab;
  audience: AudienceMode;
  depth: DepthMode;
  density: DensityMode;
}

export interface TocNode {
  id: string;
  title: string;
  page: number;
  kind: "chapter" | "section" | "subsection" | "week" | "assignment" | "exam" | "deadline" | "policy" | "objective" | "topic" | "frontmatter";
  source?: "outline" | "structured" | "layout" | "contents" | "fallback" | "syllabus";
  confidence?: number;
  children?: TocNode[];
}


export type ParagraphKind =
  | "thesis"
  | "mechanism"
  | "application"
  | "trap"
  | "memoryAnchor"
  | "definition"
  | "clinical"
  | "comparison"
  | "formula"
  | "reference"
  | "filler"
  | "dat_fact"
  | "keyDetail"
  | "keyAnatomy"
  | "unknown";

export type HighlightLevel = "important" | "support" | "additional" | "trap";

export interface EvidenceReference {
  id: string;
  page: number;
  paragraphIndex: number;
  text: string;
  kind: ParagraphKind;
}

export interface HighlightTarget {
  id: string;
  page: number;
  text: string;
  normalizedText: string;
  level: HighlightLevel;
  score: number;
  sourceParagraphIndex: number;
  kind: ParagraphKind;
  evidenceRefId: string;
  /** Fallback anchor strings forwarded from PriorityHighlightBlock — used by SmartPDFViewer when the primary text fails to match */
  support?: string[];
  evidence?: string[];
  /** Groups this target with other members of the same concept neighborhood */
  neighborhoodId?: string;
  neighborhoodTitle?: string;
  /** Full concept span bounds for multi-sentence highlighting.
   *  spanStart: first 8-10 verbatim words of the concept span.
   *  spanEnd: last 8-10 verbatim words of the concept span.
   *  When both are present, SmartPDFViewer highlights all text between them. */
  spanStart?: string;
  spanEnd?: string;
  /** AI-assigned 1-5 importance (5 = "Master This") — drives glow/border strength,
   *  layered on top of (not replacing) the ordinal group-level tier in importanceTiers.ts. */
  priorityTier?: number;
  /** Domain-specific extraction category (e.g. "mechanism", "clinical pearl"). */
  domainCategory?: string;
  /** ≤10-word AI rationale ("why a professor would underline this") — verbatim from
   *  SynthHighlightAnchor.reason, surfaced as the LeftPanel card's explanation line. */
  reason?: string;
  /** Best-effort "X–Y" line locator estimated from character offset within the page
   *  text — see ThoughtUnitNavigatorEntry.lineRange for why this is an approximation. */
  lineRange?: string;
  /** Phase 2.5: PDF.js item indexes for anchor-driven geometry lookup (Phase 1B).
   *  When present, resolveTargetGeometry uses Strategy 1 (exact item index) instead
   *  of falling back to quote search or DOM span matching. */
  pdfTextItemIndexes?: number[];
  /** Phase 2.5: Grounding state from the canonical anchor.
   *  "synthetic" means no PDF geometry was ever extracted — overlay is suppressed.
   *  All other states (exact/normalized/fuzzy/ocr) attempt geometry resolution. */
  groundingState?: "sentenceId" | "exact" | "normalized" | "fuzzy" | "ocr" | "synthetic";
  /** SurgeonAnnotationPlan visual treatment — when present, SmartPDFViewer/PdfEvidenceOverlay
   *  prefer this over `kind` for tier/visual selection. Optional and additive: targets from
   *  the older highlightAnchors/ExpertAnchor pipeline never set this. */
  treatment?: import("./insights/pageAnnotationPlan").Treatment;
  /** SurgeonAnnotationPlan canonical type — carried through for diagnostics/labels. */
  canonicalType?: import("./insights/pageAnnotationPlan").CanonicalType;
  /** Stable per-sentence id (lib/insights/segmentPageSentences.ts) this
   *  highlight was grounded against, when grounding resolved via Stage 0's
   *  guaranteed-exact sentenceId lookup (lib/highlights/groundSurgeonQuotes.ts).
   *  Undefined for entity-scope or string-matched (exact/normalized) grounding,
   *  which don't go through sentence segmentation. Development diagnostics only. */
  sourceSentenceId?: string;
  /** Character offsets of groundedText within the page text it was grounded
   *  against — development diagnostics only, not used for geometry lookup
   *  (resolveTargetGeometry re-locates by quote search; see
   *  lib/pdf/resolveAnchorGeometry.ts's own diagnostics for the RESOLVED
   *  position, which can differ from these if the page's fullText ordering
   *  disagrees with pageText's — exactly the divergence these fields help
   *  surface). */
  sourceCharStart?: number;
  sourceCharEnd?: number;
  /** SurgeonAnnotationPlan span scope — "fullSentence" (the default) covers
   *  a whole proposition; "entity" is a deliberate sub-sentence fragment
   *  (a single term/formula/drug name). Item 4C-5a's coverage auditor uses
   *  this to avoid counting an entity fragment as covering its whole
   *  containing sentence. Undefined for targets from the older
   *  highlightAnchors/ExpertAnchor pipeline, which never set it. */
  spanScope?: import("./insights/pageAnnotationPlan").SpanScope;
}

export interface ParagraphSignal {
  text: string;
  page: number;
  index: number;
  blockType: "heading" | "subheading" | "paragraph" | "bullet" | "tableRow" | "caption" | "reference" | "metadata";
  kind: ParagraphKind;
  yieldScore: number;
  definitionScore: number;
  mechanismScore: number;
  clinicalScore: number;
  comparisonScore: number;
  examScore: number;
  formulaScore: number;
  trapScore: number;
  distinctionScore: number;
  clinicalDecisionScore: number;
  examSignalScore: number;
  fillerPenalty: number;
  evidenceTerms: string[];
  suppress: boolean;
}

export interface PageSignals {
  questionCount: number;
  numberedItemCount: number;
  headingCount: number;
  formulaCount: number;
  equationLineCount: number;
  tableLikeRowCount: number;
  citationCount: number;
  bulletCount: number;
  hasDiagnosticWords: boolean;
  hasDefinitionWords: boolean;
  hasMechanismWords: boolean;
  hasComparisonWords: boolean;
  hasClinicalWords: boolean;
  hasCaseWords: boolean;
  hasReferenceWords: boolean;
  hasFormulaWords: boolean;
  hasOverviewWords: boolean;
  hasApplicationWords: boolean;
  uppercaseHeadingDensity: number;
  shortLineDensity: number;
  symbolDensity: number;
  numericDensity: number;
  nearbyHeading?: string;
  activeTopicTitle?: string;
  activeTopicKind?: string;
  documentTitle?: string;
  pageRole?: PageRole;
  paragraphSignals?: ParagraphSignal[];
  rawParagraphSignals?: ParagraphSignal[];
  pageText: string;
  nearbyText: string;
}

export interface PageClassification {
  pageType: PageType;
  confidence: number;
  secondaryTypes: Array<{ type: PageType; confidence: number }>;
  reasons: string[];
}

export interface PriorityPayload {
  pageRole: string;
  primaryGoal: string;
  mainIdeas: string[];
  whyItMatters: string[];
  whatToRemember: string[];
  whatToIgnore?: string[];
}

export interface ExplainPayload {
  meaning: string;
  mechanism: string;
  stepwiseBreakdown: string[];
  application: string[];
}

export interface RelationsPayload {
  prerequisites: string[];
  currentLinks: string[];
  downstreamLinks: string[];
}

export interface ComparePayload {
  hasMeaningfulCompare: boolean;
  compareTitle?: string;
  leftLabel?: string;
  rightLabel?: string;
  similarities?: string[];
  differences?: string[];
  examTrap?: string;
  emptyState?: string;
}

export interface InsightsPayload {
  applyTest: string[];
  examSignalScore: number;
  message?: string;
}

export interface ResolvedPanelPayload {
  classification: PageClassification;
  priority: PriorityPayload;
  explain: ExplainPayload;
  relations: RelationsPayload;
  compare: ComparePayload;
  insights: InsightsPayload;
}
