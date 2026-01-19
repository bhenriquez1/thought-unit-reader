# Surgeon-View PDRM - Product Requirements Document

## Original Problem Statement
Build a robust book processing and studying application with:
1. **TOC + Page Generation v2** - Complete hierarchical TOC parsing with confidence scores
2. **Surgeon View + NoteLab + Chapter Quiz** - Unified annotation system with PDRM tagging
3. **Study Session Mode** - Flashcard loop with spaced repetition

## Target Users
- Medical students preparing for exams
- Professionals studying dense technical material
- Anyone who needs to extract and organize key information from PDFs/documents

## Core Features - All Complete ✅

### Priority 1: TOC + Page Generation v2 ✅
- Generate single hierarchical Table of Contents per book
- Process every page without skipping/repeating
- Support digital PDFs (text layer)
- Detect scanned PDFs with warnings
- Output: `toc`, `pages`, `tocAnchors`, `warnings`, `confidence` scores

### Priority 2: Surgeon View + NoteLab + Quiz ✅
- **P0.1 Unified AnnotationStore** ✅
- **P0.2 Highlight creation + rendering** ✅
- **P0.3 Clean Mode / Context Mode** ✅
- **P0.4 NoteLab grouping + back-links** ✅
- **P1 Chapter Quiz** ✅

### Priority 3: P2 Polish ✅
- **React-PDF fix** - No more annotation loading errors
- **Study Session Mode** - Flashcard loop with SM-2 spaced repetition
- **Clickable TOC** - Single tree with navigation

## Application Navigation (5 Tabs)
1. **📖 Reader** - Main PDF reading view
2. **📑 TOC** - Clickable Table of Contents tree
3. **🔬 Surgeon View** - Highlighting + PDRM tagging + Quiz
4. **📝 NoteLab** - Organized notes with filters
5. **🧠 Study** - Flashcard study session

## What's Been Implemented

### January 2026 - Session 4: P2 Polish

#### React-PDF Fix
- Set `renderAnnotationLayer={false}` in SmartPDFViewer
- Added guards for when PDF not loaded (`pageCount > 0 && currentPage >= 1`)

#### Study Session Mode (`studySessionStore.ts`)
- `getStudyDeck()`: Builds deck from annotations with priority ordering
  - Priority 100: Weak/miss items (from quiz mistakes)
  - Priority 50: Explicit flashcards
  - Priority 10: Highlights (limited to 20)
- `startSession()`, `endSession()`: Session lifecycle
- `revealCard()`, `gradeCard()`: Card interaction with SM-2 algorithm
- `generateQuickQuestion()`: Auto-generates question every 5 cards
- localStorage persistence via Zustand persist middleware

#### StudySessionPanel Component
- Start screen with card counts
- Active session: Card display → Reveal → Grade (Again/Hard/Easy)
- Quick question popup every 5 cards
- Session complete screen with stats
- Full keyboard support

#### TocTreeSidebar Component
- Recursive tree rendering with expand/collapse
- Search filtering
- Current page highlighting
- Page jump on click
- Confidence indicators for low-quality entries
- `convertLegacyTocToNodes()` helper for existing TOC format

### Previous Sessions
- Session 3: P1 Chapter Quiz + Index integration
- Session 2: Surgeon View + NoteLab P0
- Session 1: Build fix + TOC v2

## Technical Architecture

### Stack
- **Framework**: Next.js 14 (pages router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State**: Zustand (3 stores)
- **Backend**: Firebase (MOCKED - localStorage only)
- **PDF**: react-pdf with pdfjs-dist

### Key Files
```
/app/lib/stores/
├── annotationStore.ts    # Highlights, PDRM tags
├── quizStore.ts          # Chapter quiz, attempts
└── studySessionStore.ts  # Flashcard study session

/app/components/
├── SmartPDFViewer.tsx    # PDF rendering (fixed)
├── SurgeonView.tsx       # Highlighting + Quiz panel
├── NoteLabViewEnhanced.tsx # Notes + filters
├── TocTreeSidebar.tsx    # Clickable TOC tree
└── StudySessionPanel.tsx # Flashcard study UI

/app/pages/
└── index.tsx             # Main app with 5 tabs
```

### Data Models

#### StudyCard
```typescript
{
  id: string;
  annotationId: string;
  front: string;
  back: string;
  source: 'flashcard' | 'highlight' | 'quiz-miss';
  priority: number;
  easeFactor: number;  // SM-2
  interval: number;    // Days until next review
  dueDate?: string;
}
```

#### TocNode
```typescript
{
  id: string;
  title: string;
  pageIndex: number;
  level: number;
  confidence: { overall, titleMatch, hierarchyValid, pageReliable };
  children: TocNode[];
}
```

## Testing Status
- Unit tests: 42 passed (20 annotationStore + 8 quizStore + 14 studySessionStore)
- UI tests: All 5 tabs verified, tab switching works
- React-PDF: No annotation errors in console
- Firebase: MOCKED (localStorage only)

## Prioritized Backlog

### ✅ COMPLETED
- [x] P0.1-P0.4 Surgeon View + NoteLab
- [x] P1 Chapter Quiz with flashcard generation
- [x] P2 React-PDF fix
- [x] P2 Study Session Mode
- [x] P2 Clickable TOC

### P3 - Future Enhancements
- [ ] Firebase integration (when config provided)
- [ ] Full DOCX support (Mammoth.js)
- [ ] OCR for scanned PDFs
- [ ] Export notes to markdown/PDF
- [ ] Cloud sync across devices

## Environment Notes
- Firebase: MOCKED - using localStorage for persistence
- Preview lock: disabled (NEXT_PUBLIC_DISABLE_GOOGLE_SIGNIN=1)
- Build: Passes with no errors
