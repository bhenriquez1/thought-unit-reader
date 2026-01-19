# Surgeon-View PDRM - Product Requirements Document

## Original Problem Statement
Build a sophisticated study application for processing books and documents with:
1. **Strict Separation of Modes** - Reader, TOC, Surgeon View, NoteLab, Study, Syllabus as independent views
2. **Auto-PDRM** - Automatic classification of highlights as Pattern, Decision, Risk/Mistake, or Mnemonic
3. **Auto-NoteLab** - Silent capture of highlights and quiz misses without interruption
4. **Recommended Next Action Engine** - Post-quiz recommendations based on weak areas
5. **Syllabus Mode** - Course-structured study system with topic tracking
6. **Quick Study** - Auto-find weakest items and create focused study sessions
7. **Resume Last Session** - Quick return to previous study position
8. **TOC Auto-Generation** - Extract table of contents from PDF outline or heuristic parsing

## Target Users
- Medical students preparing for exams (DAT, MCAT, USMLE)
- Professionals studying dense technical material
- Anyone who needs to extract and organize key information from PDFs/documents

## Application Navigation (6 Tabs)
1. **📖 Reader** - Pure distraction-free PDF reading (NO thought units, NO annotations)
2. **📑 TOC** - Dedicated Table of Contents tree (searchable, clickable navigation)
3. **🔬 Surgeon View** - Active learning with thought units, highlighting, PDRM tagging, quizzes
4. **📝 NoteLab** - Review workspace (notes, highlights, quiz misses) with filter sidebar
5. **🧠 Study** - Flashcard study session with spaced repetition, Quick Study, Resume
6. **📋 Syllabus** - Course-structured study planning with topic tracking

## Core Features Status

### ✅ COMPLETED - January 19, 2026

#### P0: Strict Mode Separation (COMPLETED)
- **Completed refactoring of `/app/pages/index.tsx`**
- Removed legacy "Pattern" view code that caused UI bleed
- Removed legacy TOCSidebar from main layout
- Each tab now renders ONLY its designated pure component
- No UI elements leak between modes

#### P0: TOC Auto-Generation (COMPLETED)
- **`/app/lib/stores/tocStore.ts`**: Persists TOC per document in localStorage
- **PDF Outline extraction**: `SmartPDFViewer.onOutline` → `handleOutlineExtraction` → `tocStore.saveToc`
- **Fallback heuristic**: `generateTOC()` from `/app/lib/tocParser.ts`
- **Navigation**: "Open in Reader" / "Open in Surgeon View" buttons in TOC

#### P0: React-PDF Runtime Error Fix
- Enhanced defensive guards in `SmartPDFViewer.tsx`
- Page component only renders when ALL conditions are met
- Added error/loading states for each guard failure

#### P0: Auto-PDRM Classification (`/app/lib/autoPDRM.ts`)
- Keyword-based classification system (Pattern, Decision, Risk, Mnemonic)
- Context-aware bonuses from headings and chapter titles
- Confidence scoring (0.3 - 0.95)
- Integrated into highlight creation workflow

#### P0: Silent NoteLab Capture
- `annotationStore.addAnnotation` auto-tags highlights with:
  - 'highlight' tag (always)
  - 'pattern', 'decision', 'mnemonic', 'weak' based on PDRM classification
- Quiz misses auto-create flashcards with ['flashcard', 'miss', 'weak', 'quiz-generated'] tags
- NoteLab receives all items without user interruption

#### P0: Pure View Components
- **PureReaderView.tsx**: PDF ONLY (no thought units, no TOC, no annotations)
- **PureTocView.tsx**: TOC tree with navigation buttons
- **PureSurgeonView.tsx**: Thought units + highlighting tools + quiz + review tabs
- **PureNoteLabView.tsx**: Filter/search/group notes workspace

#### P0: Recommended Next Action Engine
- After quiz completion in Surgeon View:
  - Score < 60%: "Start Study Session" button
  - Score >= 60%: "Proceed to Next Chapter" button
  - Score >= 80%: Excellent message

#### P1: Syllabus Mode (`/app/components/SyllabusModePanel.tsx`)
- Create syllabus from scratch or import from TOC
- Topic management: add, edit, delete, reorder
- Status tracking: Not Started, In Progress, Needs Review, Mastered
- Progress visualization per topic and overall
- **Study this topic** button → filtered Study Session
- **Quick Study** button in Syllabus tab

#### P1: Quick Study Feature
- ⚡ **Quick Study** button in Study tab and Syllabus tab
- Auto-finds weakest items (quiz misses, 'Again/Hard' history)
- Creates focused 10-20 card session

#### P1: Resume Last Session
- ⏯️ **Resume** button in Study tab
- Returns to last card position
- Persists across sessions via localStorage

## Technical Architecture

### Stack
- **Framework**: Next.js 14 (Pages Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand (5 stores with persist middleware)
- **Backend**: Firebase (MOCKED - localStorage only)
- **PDF**: react-pdf with pdfjs-dist

### Key Files
```
/app/pages/index.tsx           # Main routing - renderContent() handles 6 pure views

/app/lib/stores/
├── annotationStore.ts         # Highlights, PDRM tags (auto-tagging for silent capture)
├── quizStore.ts               # Chapter quiz, auto-flashcard creation
├── studySessionStore.ts       # Study sessions, Quick Study, Resume, topic filtering
├── syllabusStore.ts           # Topics, progress tracking, study integration
└── tocStore.ts                # TOC persistence per document (NEW)

/app/components/
├── SmartPDFViewer.tsx         # PDF rendering with onOutline callback
├── PureReaderView.tsx         # Pure reading mode (PDF only)
├── PureTocView.tsx            # Pure TOC mode with navigation
├── PureSurgeonView.tsx        # Thought units + highlighting + quiz
├── PureNoteLabView.tsx        # Notes workspace with filters
├── SyllabusModePanel.tsx      # Syllabus with Quick Study
├── StudySessionPanel.tsx      # Study with Quick Study + Resume
└── TocTreeSidebar.tsx         # Clickable TOC tree
```

## Testing Status
- **Build**: ✅ Passes
- **Frontend Tests**: 100% pass rate (iteration_7)
- **All 6 tabs**: Verified working with pure view separation
- **PDF Upload**: ✅ Working
- **TOC Extraction**: ✅ Working (outline or fallback)
- **React-PDF**: No annotation errors
- **Firebase**: MOCKED (localStorage only)

## Prioritized Backlog

### ✅ COMPLETED - January 19, 2026 (V2 Features)

#### P0: Surgeon View Clean/Full Mode Toggle (COMPLETED)
- **Clean Mode**: PDF only at full width (no absorption panel)
- **Full Mode**: PDF on left + Absorption Panel with high-yield content on right
- Mode state persists within Surgeon View session
- Toggle buttons: "🧹 Clean" and "📖 Full"

#### P0: Universal Zoom Behavior (COMPLETED)
- Zoom controls work in both Reader View and Surgeon View
- Zoom bounds clamped: 60% minimum, 250% maximum
- Default zoom: 125%
- Zoom buttons: "-" (decrease by 25%), "%" (reset to 125%), "+" (increase by 25%)

#### P0: Syllabus File Upload Enhancement (COMPLETED)
- PDF file parsing using pdfjs-dist
- TXT and MD file support
- Enhanced topic extraction with multiple patterns
- Page number extraction from TOC-style formats
- Error handling with user-friendly messages

### P2 - Polish (Next)
- Test full E2E: PDF upload → highlight → quiz → study flow
- Add DOCX support (currently limited)

### P3 - Future Enhancements
- Firebase integration (when config provided)
- **Elena Mode** - Interactive speech learning
- Whiteboard explanations
- Full DOCX support with mammoth library
- OCR for scanned PDFs
- Cloud sync across devices

## Environment Notes
- Firebase: MOCKED - using localStorage for persistence
- Guest mode: enabled (NEXT_PUBLIC_DISABLE_GOOGLE_SIGNIN=1)
- Build: Passes with no errors
