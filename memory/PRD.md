# Surgeon-View PDRM - Product Requirements Document

## Original Problem Statement
Build a sophisticated study application for processing books and documents with:
1. **Strict Separation of Modes** - Reader, TOC, Surgeon View, NoteLab as independent views
2. **Auto-PDRM** - Automatic classification of highlights as Pattern, Decision, Risk/Mistake, or Mnemonic
3. **Auto-NoteLab** - Silent capture of highlights and quiz misses without interruption
4. **Recommended Next Action Engine** - Post-quiz recommendations based on weak areas
5. **Syllabus Mode** - Course-structured study system with topic tracking

## Target Users
- Medical students preparing for exams (DAT, MCAT, USMLE)
- Professionals studying dense technical material
- Anyone who needs to extract and organize key information from PDFs/documents

## Application Navigation (6 Tabs)
1. **📖 Reader** - Pure reading experience (PDF + thought-unit view)
2. **📑 TOC** - Dedicated Table of Contents tree (searchable, clickable)
3. **🔬 Surgeon View** - Active learning (highlighting, PDRM tagging, quizzes)
4. **📝 NoteLab** - Review workspace (notes, highlights, quiz misses)
5. **🧠 Study** - Flashcard study session with spaced repetition
6. **📋 Syllabus** - Course-structured study planning with topic tracking

## Core Features Status

### ✅ COMPLETED - January 2026

#### P0: React-PDF Runtime Error Fix
- Enhanced defensive guards in `SmartPDFViewer.tsx`
- Page component only renders when ALL conditions are met:
  - Document is fully loaded (`isLoaded` state)
  - Valid `pdfDocument` object exists
  - Valid `pageCount` (> 0)
  - Current page within bounds (1 to pageCount)
- Added error/loading states for each guard failure
- Key change: Uses IIFE pattern for comprehensive validation before rendering

#### P0: Auto-PDRM Classification (`/app/lib/autoPDRM.ts`)
- Keyword-based classification system:
  - **Pattern**: concept, principle, theory, mechanism, etc.
  - **Decision**: treatment, approach, if...then, should, etc.
  - **Risk**: warning, danger, avoid, mistake, etc.
  - **Mnemonic**: remember, acronym, steps, etc.
- Context-aware bonuses from headings and chapter titles
- Confidence scoring (0.3 - 0.95)
- Integrated into highlight creation workflow

#### P0: Pure View Components (Strict Mode Separation)
- **PureReaderView.tsx**: PDF + thought units only, minimal toolbar
- **PureTocView.tsx**: TOC sidebar + PDF preview
- **PureSurgeonView.tsx**: Highlighting tools, quiz, review tabs
- **PureNoteLabView.tsx**: Filter/search/group notes, full review workspace

#### P0: Recommended Next Action Engine
- Implemented in PureSurgeonView quiz tab
- After quiz completion:
  - Score < 60%: "Start Study Session" button with weak item count
  - Score >= 60%: "Proceed to Next Chapter" button
  - Score >= 80%: Excellent message with next chapter prompt

#### P1: Syllabus Mode (`/app/components/SyllabusModePanel.tsx`)
- Create syllabus from scratch or import from TOC
- Topic management: add, edit, delete, reorder
- Status tracking: Not Started, In Progress, Needs Review, Mastered
- Progress visualization per topic and overall
- Recommended next topic based on status
- CSV import/export support
- Integration with Study Sessions

### Previous Completions
- P0.1-P0.4 Surgeon View + NoteLab unified annotation system
- P1 Chapter Quiz with automatic flashcard generation
- P2 Study Session with SM-2 spaced repetition
- P2 Clickable TOC tree with search and navigation

## Technical Architecture

### Stack
- **Framework**: Next.js 14 (pages router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State**: Zustand (4 stores)
- **Backend**: Firebase (MOCKED - localStorage only)
- **PDF**: react-pdf with pdfjs-dist

### Key Files
```
/app/lib/stores/
├── annotationStore.ts    # Highlights, PDRM tags, unified annotations
├── quizStore.ts          # Chapter quiz, attempts, flashcard generation
├── studySessionStore.ts  # Flashcard study with SM-2
└── syllabusStore.ts      # Course topics, progress tracking

/app/lib/
└── autoPDRM.ts           # Automatic PDRM classification

/app/components/
├── SmartPDFViewer.tsx    # PDF rendering (with defensive guards)
├── PureReaderView.tsx    # Pure reading mode
├── PureTocView.tsx       # Pure TOC mode
├── PureSurgeonView.tsx   # Pure surgeon mode (highlighting + quiz)
├── PureNoteLabView.tsx   # Pure notelab mode (review workspace)
├── SyllabusModePanel.tsx # Syllabus/course planning
├── StudySessionPanel.tsx # Flashcard study UI
├── TocTreeSidebar.tsx    # Clickable TOC tree
└── SurgeonView.tsx       # Legacy surgeon view (still used)

/app/pages/
└── index.tsx             # Main app with 6 tabs
```

### Data Models

#### Annotation (PDRM-enabled)
```typescript
{
  id: string;
  documentId: string;
  chapterId: string;
  pageIndex: number;
  selectedText: string;
  anchor: TextRangeAnchor | BBoxAnchor;
  pdrm: {
    pattern?: string;      // P: Core concepts
    decisionRule?: string; // D: Clinical decisions
    isMistake?: boolean;   // R: Risk/weak area
    mnemonic?: string;     // M: Memory aids
    weakAreaTags?: string[];
  };
  color: string;
  tags: string[];
  flashcardFront?: string;
  flashcardBack?: string;
}
```

#### SyllabusTopic
```typescript
{
  id: string;
  title: string;
  order: number;
  chapterIds: string[];
  pageRanges: Array<{ start: number; end: number }>;
  status: 'not_started' | 'in_progress' | 'needs_review' | 'mastered';
  completionPercentage: number;
  highlightCount: number;
  quizScore?: number;
  lastStudied?: string;
}
```

## Testing Status
- Build: ✅ Passes with no errors
- Unit tests: 42 passed (annotation + quiz + study session)
- UI tests: All 6 tabs verified, tab switching works
- React-PDF: Defensive guards prevent annotation errors
- Firebase: MOCKED (localStorage only)

## Prioritized Backlog

### P2 - Polish (Current)
- [ ] Integrate pure view components into main routing
- [ ] Test PDF upload with new surgeon view
- [ ] Verify auto-PDRM classification in real usage

### P3 - Future Enhancements
- [ ] Firebase integration (when config provided)
- [ ] Full DOCX support (Mammoth.js)
- [ ] OCR for scanned PDFs
- [ ] Export notes to markdown/PDF
- [ ] Cloud sync across devices
- [ ] AI-powered PDRM classification (upgrade from keyword-based)

## Environment Notes
- Firebase: MOCKED - using localStorage for persistence
- Guest mode: enabled (NEXT_PUBLIC_DISABLE_GOOGLE_SIGNIN=1)
- Build: Passes with no errors
