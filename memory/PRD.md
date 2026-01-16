# Surgeon-View PDRM - Product Requirements Document

## Original Problem Statement
Build a robust book processing and studying application with two main priorities:
1. **TOC + Page Generation v2** - Complete hierarchical TOC parsing with confidence scores
2. **Surgeon View + NoteLab** - Unified annotation system with PDRM (Pattern, Decision, Risk/Mistake, Mnemonic) tagging

## Target Users
- Medical students preparing for exams
- Professionals studying dense technical material
- Anyone who needs to extract and organize key information from PDFs/documents

## Core Requirements

### Priority 1: TOC + Page Generation v2 (COMPLETED)
- Generate single hierarchical Table of Contents per book
- Process every page without skipping/repeating
- Support digital PDFs (text layer)
- Detect scanned PDFs with warnings
- Output: `toc`, `pages`, `tocAnchors`, `warnings`, `confidence` scores

### Priority 2: Surgeon View + NoteLab (IN PROGRESS)
- **P0.1 Unified AnnotationStore** ✅
- **P0.2 Highlight creation + rendering** ✅
- **P0.3 Clean Mode / Context Mode** ✅
- **P0.4 NoteLab grouping + back-links** ✅
- **P1 Chapter Quiz** (NEXT)

## User Choices/Preferences
1. **Highlighting**: Text-selection based (primary) with fallback to block-based
2. **PDRM**: Tags/labels attached to highlights (V1), not separate cards
3. **Build order**: Incremental testing after each sub-feature

## What's Been Implemented

### December 2025

#### Session 1 - Build Fix & TOC v2
- Fixed critical Firebase SSR build failure (lazy-loaded singletons)
- Fixed supervisor configuration for monolithic Next.js app
- Implemented TOC v2 parser with feature flag

#### Session 2 - Surgeon View + NoteLab P0
- **annotationStore.ts**: Complete Zustand store with:
  - `Annotation` type with anchor (textRange/bbox), selectedText, PDRM metadata
  - CRUD operations (addAnnotation, updateAnnotation, deleteAnnotation)
  - View mode management (clean/context/full)
  - Persistence via localStorage + Firestore (when configured)
  - Index by page and chapter for fast lookups
  
- **SurgeonView.tsx**: Complete component with:
  - Text selection → action menu workflow
  - PDRM tagging (P/D/R/M) with color coding
  - Clean Mode (highlights + headings only)
  - Full View (content with highlighted marks)
  - Right panel with Highlights/PDRM/Quiz tabs
  - Comprehensive data-testids for testing

- **NoteLabViewEnhanced.tsx**: Complete component with:
  - Filtering by type (all/highlights/notes/flashcards/patterns/decisions/mnemonics/mistakes)
  - Grouping by chapter
  - Search functionality
  - Edit/delete annotations
  - Click → navigate to Surgeon View location
  - Statistics sidebar

## Technical Architecture

### Stack
- **Framework**: Next.js 14 (monolithic)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State**: Zustand (annotation store)
- **Backend**: Firebase (Auth, Firestore, Storage)
- **PDF**: react-pdf with pdfjs-dist

### Key Files
- `/app/lib/stores/annotationStore.ts` - Unified annotation store
- `/app/components/SurgeonView.tsx` - Surgeon View component
- `/app/components/NoteLabViewEnhanced.tsx` - NoteLab component
- `/app/lib/firebase.ts` - Firebase with lazy-loaded services
- `/app/lib/tocParserV2.ts` - TOC v2 parsing logic

### Data Model (Annotation)
```typescript
{
  id: string;
  documentId: string;
  chapterId: string;
  pageIndex: number;
  anchor: TextRangeAnchor | BBoxAnchor;
  selectedText: string;
  modeContext?: 'clean' | 'context';
  pdrm: {
    pattern?: string;
    decisionRule?: string;
    mnemonic?: string;
    isMistake?: boolean;
    weakAreaTags?: string[];
  };
  color: string;
  tags: string[];
  noteTitle?: string;
  noteContent?: string;
  flashcardFront?: string;
  flashcardBack?: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
}
```

## Prioritized Backlog

### P0 - Core Annotation System (DONE)
- [x] P0.1 Unified AnnotationStore
- [x] P0.2 Highlight creation + rendering
- [x] P0.3 Clean Mode / Context Mode
- [x] P0.4 NoteLab grouping + back-links

### P1 - Chapter Quiz (NEXT)
- [ ] Generate 5 questions per chapter from highlights/headings
- [ ] Store quiz results
- [ ] Wrong answers → flashcard entries with "miss" tag

### P2 - Format Support
- [ ] Full DOCX support (Mammoth.js integration)
- [ ] OCR for scanned PDFs

### P3 - Enhancements
- [ ] Export notes functionality
- [ ] Spaced repetition for flashcards
- [ ] Cross-chapter linking

## Testing Status
- Unit tests: 20 passed (annotationStore CRUD, PDRM tagging, view modes)
- UI tests: Main page loads, tab switching, guest mode works
- Firebase: MOCKED (using localStorage for persistence)

## Environment Notes
- Firebase not configured in dev environment
- Preview lock disabled for testing (NEXT_PUBLIC_DISABLE_GOOGLE_SIGNIN=1)
- Supervisor manages frontend/backend services
