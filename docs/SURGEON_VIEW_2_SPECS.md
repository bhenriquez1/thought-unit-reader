# Surgeon View 2.0 + Course Intelligence Build Specifications

## 1. Component Map

### Core Components

```
SurgeonView2/
├── SurgeonStackPanel.tsx       # Main container with filtering
│   ├── FilterBar.tsx           # View modes, DAT lenses, priority filters
│   ├── ConceptCard.tsx         # Individual concept with source linking
│   ├── ClusterCard.tsx         # Grouped concepts (expand/collapse)
│   ├── PearlCard.tsx           # High-value insights
│   └── BottomDrawer.tsx        # Source, Reasoning, Flashcards, Notes tabs
```

### Props Interfaces

**SurgeonStackPanelProps:**
- `documentId: string`
- `pageNumber: number`
- `concepts: CoreConceptV2[]`
- `clusters: ConceptCluster[]`
- `pearls: Pearl[]`
- `filters: ViewFilters`
- `selectedConceptId: string | null`
- `onConceptClick: (concept) => void`
- `onFilterChange: (filters) => void`
- `onJumpToSource: (concept) => void`

**ConceptCardProps:**
- `concept: CoreConceptV2`
- `isSelected: boolean`
- `onClick: () => void`
- `onTagChange: (tags) => void`
- `onJumpToSource: () => void`

### State Store

`useSurgeonView2Store` (Zustand):
- Document state (documentId, currentPage)
- Concepts, clusters, pearls arrays
- Selection state (selectedConceptId, highlightedAnchor)
- Filters (ViewFilters)
- Drawer state (isOpen, activeTab)
- Page cache with 5-minute TTL
- Extraction status

---

## 2. Syllabus Parser Rules

### Block Detection Patterns

| Block Type | Patterns |
|------------|----------|
| WEEK | `^Week\s*(\d+)`, `^Wk\.?\s*(\d+)`, `^W(\d+)\b` |
| MODULE | `^Module\s*(\d+)`, `^Unit\s*(\d+)`, `^Part\s*(\d+)` |
| EXAM | `\b(Exam\|Test)\s*#?(\d+)`, `\b(Midterm\|Final)` |
| ASSIGNMENT | `\b(HW\|Homework)\s*#?(\d+)`, `\b(Lab)\s*#?(\d+)` |
| LECTURE | `^Lecture\s*(\d+)`, `^Class\s*(\d+)` |

### Date Patterns

- MM/DD format: `(\d{1,2})\/(\d{1,2})`
- Month Day: `(Jan|Feb|Mar|...)\s+(\d{1,2})`
- Date ranges: `(date)\s*[-–—to]+\s*(date)`

### Reading Patterns

| Type | Patterns |
|------|----------|
| CHAPTER | `\bCh(?:apter)?\.?\s*(\d+)` |
| PAGES | `\bpp?\.?\s*(\d+)\s*[-–—]\s*(\d+)` |
| SECTION | `\b(\d+\.\d+)(?:\s*[-–—]\s*(\d+\.\d+))?` |

### Usage

```typescript
import { parseSyllabus } from '@/lib/syllabusParser';

const syllabus = parseSyllabus(rawText);
// Returns: { blocks: SyllabusBlock[], metadata: { courseTitle, instructor, term, ... } }
```

---

## 3. TOC Matching Algorithm

### Matching Steps

1. **Normalize text**: lowercase, remove punctuation, collapse whitespace
2. **Extract keywords**: filter stop words, keep content words
3. **Calculate similarity**:
   - Exact match → 1.0
   - Substring match → 0.9
   - Keyword overlap (Jaccard) → 0.0–0.85

### Chapter Matching

```typescript
// Direct chapter number matching
if (reading.kind === 'CHAPTER' && reading.normalized?.chapter) {
  const tocChapterMatch = tocItem.title.match(/chapter\s*(\d+)/i);
  if (tocChapterMatch && parseInt(tocChapterMatch[1]) === chapterNum) {
    score = 0.95;  // High confidence
  }
}
```

### Confidence Thresholds

| Score | Action |
|-------|--------|
| > 0.7 | Auto-accept match |
| 0.4–0.7 | Suggest with confirmation |
| < 0.4 | No match |

### Usage

```typescript
import { generateCoursePlan, searchTocForTopic } from '@/lib/syllabusParser';

const plan = generateCoursePlan(parsedSyllabus, tocItems);
// Returns: { mappings, coverage, studySchedule }

const matches = searchTocForTopic("cell division", tocItems);
// Returns: TocMatch[] with scores
```

---

## 4. Reasoning Overlay Prompts

### General Study Lens

```
Given this concept from an academic text:

"{concept.oneLiner}"

Context: {concept.sourceExcerpt}

Generate a reasoning overlay with:
1. MEANING: What this concept means in simple terms (1-2 sentences)
2. WHY IT MATTERS: Why a student should care about this (1-2 sentences)
3. WHEN TO USE: Practical application scenarios (1-2 sentences)
4. COMMON TRAP: A mistake students often make (1 sentence)
5. EXAMPLE: A concrete example illustrating the concept
```

### Exam Prep Lens

```
Given this concept that may appear on an exam:

"{concept.oneLiner}"

Generate exam-focused analysis:
1. TESTABLE ASPECTS: What specifically could be tested
2. QUESTION TYPES: MC, short answer, essay angles
3. KEY FACTS: Must-memorize details
4. TRAP ANSWERS: Common wrong answer patterns
5. PRACTICE QUESTION: Generate a realistic exam question with 4 choices
```

### DAT-Specific Lenses

**Biology (BIO):**
- Focus on: cell biology, genetics, anatomy, physiology
- Question style: Detail recall, process steps, comparisons

**General Chemistry (GC):**
- Focus on: equations, calculations, periodic trends
- Question style: Problem-solving, balancing, predicting

**Organic Chemistry (OC):**
- Focus on: mechanisms, reactions, stereochemistry
- Question style: Predict products, identify intermediates

---

## 5. Pearl Detection Patterns

### Pattern Categories

| Type | Patterns |
|------|----------|
| insight | "key point", "critical", "remember", "always/never" |
| tip | "tip", "trick", "shortcut", "quick way" |
| warning | "warning", "caution", "avoid", "dangerous" |
| mnemonic | "mnemonic", "acronym", "easy to remember" |
| shortcut | "shortcut", "quick calculation", "fast way" |
| exception | "except", "exception", "unless", "but not" |

### Priority Indicators

High priority if contains:
- "most important"
- "high-yield"
- "exam favorite"
- "commonly tested"
- "critical"

---

## 6. Source Anchoring System

### Anchor Structure

```typescript
interface SourceAnchor {
  pageIndex: number;        // 0-based page
  paragraphIndex: number;   // Position on page
  snippetHash: string;      // FNV-1a hash of first 100 chars
  charStart?: number;       // Character offset
  charEnd?: number;
  boundingBox?: { x, y, width, height };
}
```

### Hash Generation (FNV-1a style)

```typescript
function generateSnippetHash(text: string): string {
  const snippet = text.slice(0, 100);
  let hash = 2166136261;
  for (let i = 0; i < snippet.length; i++) {
    hash ^= snippet.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
```

### Re-finding Text

1. Navigate to `anchor.pageIndex`
2. Extract paragraphs from page text
3. Find paragraph at `anchor.paragraphIndex`
4. Verify by comparing `snippetHash`
5. Highlight at `charStart` to `charEnd`

---

## 7. View Modes

### Study Mode (default)
- All concepts visible
- Pearls highlighted
- Full context in drawer

### Exam Mode
- High-yield filter ON
- Exam weight visible
- Practice questions prominent

### Review Mode
- Collapsed clusters
- Focus on weak areas (from SRS data)

### Clinical Mode (medical)
- Clinical pearls emphasized
- Real-world applications

---

## 8. File Structure

```
lib/
├── surgeonView2/
│   ├── types.ts          # All TypeScript interfaces
│   ├── anchoring.ts      # Snippet hash, anchor utilities
│   ├── clustering.ts     # Concept clustering, pearl detection
│   └── index.ts          # Module exports
├── syllabusParser/
│   ├── parser.ts         # Deterministic syllabus parsing
│   ├── coursePlanner.ts  # TOC matching algorithm
│   └── index.ts          # Module exports
├── stores/
│   └── surgeonView2Store.ts  # Zustand state management

components/
├── surgeonView2/
│   ├── ConceptCard.tsx
│   ├── ClusterCard.tsx
│   ├── PearlCard.tsx
│   ├── FilterBar.tsx
│   ├── BottomDrawer.tsx
│   ├── SurgeonStackPanel.tsx
│   └── index.ts
```
