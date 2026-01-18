# Surgeon-View PDRM - Product Requirements Document

## Original Problem Statement
Build a robust book processing and studying application with two main priorities:
1. **TOC + Page Generation v2** - Complete hierarchical TOC parsing with confidence scores
2. **Surgeon View + NoteLab + Chapter Quiz** - Unified annotation system with PDRM tagging and quiz functionality

## Target Users
- Medical students preparing for exams
- Professionals studying dense technical material
- Anyone who needs to extract and organize key information from PDFs/documents

## Core Requirements

### Priority 1: TOC + Page Generation v2 ✅ COMPLETED
- Generate single hierarchical Table of Contents per book
- Process every page without skipping/repeating
- Support digital PDFs (text layer)
- Detect scanned PDFs with warnings
- Output: `toc`, `pages`, `tocAnchors`, `warnings`, `confidence` scores

### Priority 2: Surgeon View + NoteLab + Quiz ✅ COMPLETED
- **P0.1 Unified AnnotationStore** ✅
- **P0.2 Highlight creation + rendering** ✅
- **P0.3 Clean Mode / Context Mode** ✅
- **P0.4 NoteLab grouping + back-links** ✅
- **P1 Chapter Quiz** ✅

## User Choices/Preferences
1. **Highlighting**: Text-selection based (primary) with fallback to block-based
2. **PDRM**: Tags/labels attached to highlights (V1), not separate cards
3. **Build order**: Incremental testing after each sub-feature

## What's Been Implemented

### January 2026

#### Session 3 - P1 Chapter Quiz + Index Integration
- **quizStore.ts**: Complete Zustand store with:
  - `generateQuiz()`: Creates 5 questions per chapter (3 recall, 2 application)
  - Question sources: highlights (primary), headings (secondary)
  - `submitAnswer()`: Track correct/incorrect answers
  - `finishQuiz()`: Calculate score, save attempt, create flashcards for wrong answers
  - Persistence via localStorage (Zustand persist middleware)
  
- **SurgeonView QuizPanel**: Full quiz UI with:
  - Progress bar showing question number
  - MCQ and short-answer question types
  - Answer feedback (correct/incorrect with explanations)
  - Navigation (prev/next/finish)
  - Results screen with score and retake button
  - Auto-flashcard creation notice for wrong answers

- **NoteLabViewEnhanced**: Added "Missed/Weak" filter:
  - New filter type: `weak`
  - Filters annotations with tags: `weak`, `miss`, `quiz-generated`, `quiz-miss`
  - Also shows items with `pdrm.isMistake` or `pdrm.weakAreaTags`

- **pages/index.tsx**: Clean navigation integration:
  - Tab bar with Reader, Surgeon View, NoteLab buttons
  - State preserved when switching tabs
  - Surgeon View shows split PDF + annotation panel
  - NoteLab shows split PDF + notes panel

### December 2025

#### Session 2 - Surgeon View + NoteLab P0
- **annotationStore.ts**: Complete Zustand store with PDRM metadata
- **SurgeonView.tsx**: Highlighting, Clean Mode, PDRM tagging
- **NoteLabViewEnhanced.tsx**: Filtering, grouping, back-links

#### Session 1 - Build Fix & TOC v2
- Fixed Firebase SSR build failure
- Fixed supervisor configuration
- Implemented TOC v2 parser

## Technical Architecture

### Stack
- **Framework**: Next.js 14 (monolithic)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State**: Zustand (annotation store, quiz store)
- **Backend**: Firebase (Auth, Firestore, Storage) - MOCKED in dev
- **PDF**: react-pdf with pdfjs-dist

### Key Files
- `/app/lib/stores/annotationStore.ts` - Unified annotation store
- `/app/lib/stores/quizStore.ts` - Quiz generation and tracking
- `/app/components/SurgeonView.tsx` - Surgeon View with quiz panel
- `/app/components/NoteLabViewEnhanced.tsx` - NoteLab with filters
- `/app/pages/index.tsx` - Main app with tab navigation

### Data Models

#### Annotation
```typescript
{
  id: string;
  documentId: string;
  chapterId: string;
  pageIndex: number;
  anchor: TextRangeAnchor | BBoxAnchor;
  selectedText: string;
  pdrm: { pattern?, decisionRule?, mnemonic?, isMistake?, weakAreaTags? };
  color: string;
  tags: string[];
  flashcardFront?: string;
  flashcardBack?: string;
  userId: string;
}
```

#### QuizAttempt
```typescript
{
  id: string;
  documentId: string;
  chapterId: string;
  attemptNumber: number;
  score: number;
  totalQuestions: number;
  answers: QuizAnswer[];
  wrongQuestionIds: string[];
  createdAt: string;
  completedAt: string;
}
```

## Prioritized Backlog

### ✅ COMPLETED
- [x] P0.1-P0.4 Surgeon View + NoteLab features
- [x] P1 Chapter Quiz with flashcard generation
- [x] Index.tsx integration with clean navigation

### P2 - Future Enhancements
- [ ] Full DOCX support (Mammoth.js integration)
- [ ] OCR for scanned PDFs
- [ ] Study Session Mode (cycles through highlights/flashcards)
- [ ] Spaced repetition algorithm
- [ ] Export notes to markdown/PDF

## Testing Status
- Unit tests: 28 passed (20 annotationStore + 8 quizStore)
- UI tests: Tab navigation, filter switching verified
- Firebase: MOCKED (using localStorage for persistence)

## Environment Notes
- Firebase not configured in dev environment
- Preview lock disabled (NEXT_PUBLIC_DISABLE_GOOGLE_SIGNIN=1)
- Supervisor manages frontend/backend services
