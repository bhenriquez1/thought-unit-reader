# Page Intelligence Pipeline

This document describes the full data flow from PDF page load to right-panel
output items. Keep this in sync with code changes.

---

## 1. Page Load → OCR / Native Text

**Entry point**: `buildPageIntelligence(args)` in `lib/page-intelligence/index.ts`

```
PDF page rendered by react-pdf
  ↓
getPageText(pageNumber)           // SurgeonCockpit helper
  Tier 1: pageTexts Map           // pre-parsed at book load via parseBookWithChapters
  Tier 2: DOM text layer scrape   // .react-pdf__Page__textContent
  Tier 3: OCR fallback            // Tesseract via ocrDataUrlToText()
  ↓
PageText { text, source: "native"|"ocr", confidence }
```

Cache check (IndexedDB, 24h TTL) happens before OCR to avoid redundant work.

---

## 2. Normalize Text

Raw text is used directly; math-heavy blocks get extra treatment in step 4.
The `normalizeMathText()` function (`lib/mathExtractor.ts`) handles:
- Unicode math operators → ASCII (`−→-`, `×→*`, `∑→sum`, …)
- OCR confusion fixes (`O/0`, `l/1`, `rn/m`) when mathDensity ≥ 0.15

---

## 3. Paragraph Segmentation → `ParagraphUnit[]`

**File**: `lib/page-intelligence/paragraphIntelligence.ts`
**Function**: `buildParagraphUnits(text, pageIndex, docId)`

### Segmentation (2-tier)
1. Split on `\n\n+` (double newlines)
2. For blocks > 400 chars: further split at sentence boundaries before capitals

### Role Classification (domain-agnostic patterns)
| Role | Signal |
|------|--------|
| `definition` | "is defined as", "refers to", "is termed" |
| `mechanism` | "leads to", "pathway", "triggers", "activates" |
| `clinical` | "patient", "diagnosis", "treatment", "prescribe" |
| `exam_trap` | "except", "beware", "most common", "not" |
| `formula` | `=`, math symbols, "equation", "calculated as" |
| `summary` | (default — low-signal prose) |

### Importance Scoring (0–100)
```
+25  role = definition
+25  role = mechanism
+20  hasClinicalTerms
+15  hasNumbers AND hasUnits
+15  role = exam_trap
+10  hasComparison
-10  wordCount > 80 AND no numbers AND no clinical terms
```
Clamped to [0, 100]. Output sorted by importance desc.

### Output shape
```ts
ParagraphUnit {
  id: `pu:${docId}:${pageIndex}:${startChar}`
  pageIndex, text, startChar, endChar
  role, importance, keyTerms, signals
  bbox? // set if OCR provides coordinates
}
```

---

## 4. Segment text (existing engine)

**File**: `lib/page-intelligence/segmenter.ts`
**Function**: `segmentText(text, { pageNumber })`

Runs in parallel with step 3. Produces `Segment[]` with kind classification
(heading, paragraph, list, caption, tableHint, **math**).

Math detection via `computeMathDensity()` (`lib/mathExtractor.ts`):
- density ≥ 0.4 → `kind: "math"`, sets `mathDensity`, `mathRaw`, `isDisplayMath`
- density ≥ 0.15 → sets `mathDensity`, `mathRaw` on paragraph/heading segments

---

## 5. Signal Detection + Relation Extraction

- `detectSignals({ segments })` → `Signal[]` — pattern matches for definitions, contrast, cause-effect, etc.
- `extractRelations({ segments })` → `Relation[]` — concept-pair extraction

---

## 6. Clustering

`clusterSegments(segments)` + `mergeSimilarClusters(clusters)` → `Cluster[]`
Groups segments by keyword overlap for topic grouping in the Relations tab.

---

## 7. Engines produce `AnchoredItem[]`

All engine outputs carry a `SourceRef` for click-to-source navigation.

### 7a. Insight Generation (DAT scoring)
`generateInsights({ segments, signals, relations, clusters })` → `Insight[]`

DAT scoring weights:
- +25 definition signal
- +20 list/enumeration
- +20 contrast/comparison
- +15 numbers/thresholds
- +15 exam keywords (max 30)
- +15 cause→effect
- +10 test-trap language
- +8  heading proximity
- 0–10 concept repetition
- -15 filler narrative
- -10 low OCR confidence

Math segments (density ≥ 0.4) additionally produce "Key Formula" insights
with floor score 40, tagged `[threshold, math]`.

### 7b. Math Engine
`runMathEngine(units, docId)` → `AnchoredItem[]` (kind="math")

For `role="formula"` ParagraphUnits:
- Normalizes via `normalizeMathText()`
- Extracts variable meanings ("A = base width")
- Detects exam traps (unit conversions, approximations, inequalities)
- Determines render mode: `katex` (safe ASCII) | `mono` (monospace fallback)

### 7c. Clinical Reasoning Engine
`runClinicalReasoningEngine(units, docId)` → `AnchoredItem[]` (kind="clinical_flow")

Detects IF→THEN chains:
- Antecedent: if/when/unless/given that + condition
- Consequent: then/therefore/leads to + action verb
- Falls back to test-result + action patterns
- Classifies nodes as finding/diagnosis/treatment/etc.
- Returns payload: `ClinicalFlow { nodes, edges }`

### 7d. Explain Generation
`generateExplain({ segments, signals, insights })` → `ExplainResult`
Ninja Nerd / Armando style: summary, bullets, pitfalls, mnemonics.

### 7e. Study Cards
`generateCards({ insights, segments, pageNumber, docId })` → `StudyCard[]`
SRS-ready flashcards from top insights.

---

## 8. Domain Enrichment (optional)

**File**: `lib/surgeonEngine/domains/DomainModule.ts`

```
getApplicableModules(ctx: DomainContext)
  → [universal, oralPath?, perio?, ...]
  ↓
enrichParagraph(p): ParagraphUnit   // boost importance, add keyTerms
enrichItem(i): AnchoredItem        // add domain tags
```

### Active Modules
| Module | Activation |
|--------|-----------|
| `universal` | Always active — high-yield, definition, threshold tags |
| `oral-path` | Title/TOC contains oral path keywords |
| `perio` | Title/TOC contains periodontal keywords |

Domain modules **only add** tags and small importance boosts — they never
change core role classification or break non-dental books.

---

## 9. Cache + Store

```
intelligence: PageIntelligence → IndexedDB (key: pageint:{docId}:{pageNumber}, TTL 24h)
  ↓ courseContextStore.storePageIntelligence()
  ↓ studySessionStore.addCardsFromPageIntel()
  ↓ SurgeonCockpit state (setPageIntelligence, setPageInsights, …)
  ↓ UI Panels
    Priority tab  → PriorityComprehensionPanel (insights + paragraphUnits)
    Explain tab   → pageIntelligence.explain
    Relations tab → relations + clinicalFlow items
    Compare tab   → contrast items
    Insights tab  → pageInsights.whatMatters + whatMissing + study cards
```

---

## 10. UI Rendering with Jump-to-Source

Each `PriorityItemCard` carries a page reference (`evidence[0].page`).
Clicking the `p.xx` button calls `onJumpToPage(page)`.

For items with a `SourceRef`, the full `focusOnSource(source)` flow:
1. `onJumpToPage(source.pageIndex)` — navigate PDF to correct page
2. `onHighlightParagraph(source.quote)` — scroll and highlight excerpt
3. Panel updates `activeParagraphId` → card scrolls into view (if Sync ON)

---

## Prefetch

On page change, SurgeonCockpit prefetches pages N+1 and N-1 after a 3s delay
(text-only, no OCR, no DAT scoring). Cached results make subsequent extractions
return from cache in < 50ms.
