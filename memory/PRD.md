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

<<<<<<< HEAD
## Application Navigation (7 Tabs)
1. **📖 Reader** - Pure reading experience (PDF + thought-unit view)
2. **📑 TOC** - Dedicated Table of Contents tree (searchable, clickable)
3. **🔬 Surgeon View** - Active learning (highlighting, PDRM tagging, quizzes)
4. **📝 NoteLab** - Review workspace (notes, highlights, quiz misses)
5. **🧠 Study** - Flashcard study session with spaced repetition
=======
## Application Navigation (6 Tabs)
1. **📖 Reader** - Pure distraction-free PDF reading (NO thought units, NO annotations)
2. **📑 TOC** - Dedicated Table of Contents tree (searchable, clickable navigation)
3. **🔬 Surgeon View** - Active learning with thought units, highlighting, PDRM tagging, quizzes
4. **📝 NoteLab** - Review workspace (notes, highlights, quiz misses) with filter sidebar
5. **🧠 Study** - Flashcard study session with spaced repetition, Quick Study, Resume
>>>>>>> origin/main
6. **📋 Syllabus** - Course-structured study planning with topic tracking
7. **📊 PDRM** - PDRM entries grouped by document/chapter/page with navigation

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

<<<<<<< HEAD
#### P0: Pure View Components (Strict Mode Separation) ✅ VERIFIED January 2026
- **PureReaderView.tsx**: PDF only (distraction-free reading), uses global zoom store
- **PureTocView.tsx**: TOC tree only (no PDF panel), with "Open in Reader/Surgeon" buttons
- **PureSurgeonView.tsx**: PDF + Thought Units + Highlighting tools + Clean/Full/PDF toggle + Auto/Manual PDRM toggle
- **PureNoteLabView.tsx**: Notes workspace only (no PDF)
- **StudySessionPanel.tsx**: Flashcard study only (no PDF)
- **SyllabusModePanel.tsx**: Syllabus workspace only (no PDF)
- **PurePdrmView.tsx**: PDRM entries grouped by doc/chapter/page with jump-to-page
- **V1 Stabilization Complete**: Removed shared TOC sidebar from all views, each tab now renders ONLY its pure component with no UI leakage

#### P0: Global Zoom Controls ✅ January 2026
- Global zoom store (`/app/lib/stores/zoomStore.ts`) with localStorage persistence
- Zoom controls in top app bar (visible in Reader and Surgeon View)
- Zoom In (+25%), Zoom Out (-25%), Reset (125%), shows current %
- Guards against crash when PDF not loaded
- Syncs between Reader and Surgeon View

#### P0: Auto/Manual PDRM Toggle ✅ January 2026
- Toggle in Surgeon View toolbar (Auto/Manual mode)
- Auto mode: Highlights auto-classified as Pattern/Decision/Risk/Mnemonic/General
- Manual mode: Opens classification dialog for user selection
- Preference persisted in pdrmStore

#### P0: PDRM Tab ✅ January 2026
- New 7th tab for viewing all PDRM entries
- Grouped by page, chapter, or type (user selectable)
- Search and filter functionality
- Jump to page + highlight flash (navigation buttons)
- "Open in Reader" / "Open in Surgeon" buttons on each entry

#### P0: PDRM V2 Workflow (Structured Extraction System) ✅ January 2026
**Surgeon View + PDRM are ONE workflow**
- PDRM is NOT a summary feature - it's Pattern/Decision/Risk/Mnemonic extraction
- Auto mode: highlight → instant PDRM card; page change → incremental page PDRM (cached)
- Manual mode: highlight → Draft PDRM (empty fields); page change → NO auto-fill
- Toggle visibly changes behavior on next action (green=AUTO, yellow=MANUAL)
- PDRM sidebar in Surgeon View shows current page entries

**Implementation Files:**
- `/app/components/PureSurgeonView.tsx` - Line 92 (autoMode), Line 177-215 (handleCreateHighlight), Line 115-155 (page effect)
- `/app/lib/pdrmAIExtractor.ts` - Line 43-91 (prompts), Line 97-160 (heuristic extraction)
- `/app/lib/stores/pdrmStore.ts` - Line 53-57 (pageCache), Line 128-150 (cache functions)

**Debounce/Cache Strategy:**
- `DEBOUNCE_MS = 500` for page extraction
- `MIN_REQUEST_INTERVAL_MS = 1000` rate limit
- Page cache: `${docId}_${pageNumber}` → prevents re-extraction
- Heuristic extraction (no LLM API calls currently)
=======
#### P0: Pure View Components
- **PureReaderView.tsx**: PDF ONLY (no thought units, no TOC, no annotations)
- **PureTocView.tsx**: TOC tree with navigation buttons
- **PureSurgeonView.tsx**: Thought units + highlighting tools + quiz + review tabs
- **PureNoteLabView.tsx**: Filter/search/group notes workspace
>>>>>>> origin/main

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
<<<<<<< HEAD
├── annotationStore.ts    # Highlights, PDRM tags (auto-tagging for silent capture)
├── quizStore.ts          # Chapter quiz, auto-flashcard creation
├── studySessionStore.ts  # Study sessions, Quick Study, Resume, topic filtering
├── syllabusStore.ts      # Topics, progress tracking, study integration
├── tocStore.ts           # Table of Contents with document grouping
├── zoomStore.ts          # Global zoom state with persistence
└── pdrmStore.ts          # PDRM V2: structured P/D/R/M fields, draft support, page cache

/app/lib/
└── pdrmAIExtractor.ts    # AI extraction service: prompts, heuristics, debounce, cache

/app/components/
├── SmartPDFViewer.tsx    # PDF rendering with defensive guards
├── PureReaderView.tsx    # Pure reading mode (uses global zoom)
├── PureTocView.tsx       # Pure TOC mode with navigation buttons
├── PureSurgeonView.tsx   # PDRM workflow: Auto/Manual toggle, sidebar, page extraction
├── PurePdrmView.tsx      # PDRM browse/search view
├── PureNoteLabView.tsx   # Pure notelab mode
├── SyllabusModePanel.tsx # Syllabus with Quick Study
├── StudySessionPanel.tsx # Study with Quick Study + Resume
└── TocTreeSidebar.tsx    # Clickable TOC tree
=======
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
>>>>>>> origin/main
```

## Testing Status
- **Build**: ✅ Passes
<<<<<<< HEAD
- **Unit Tests**: 20/20 passed (100%)
- **UI Tests**: All 7 tabs verified, all buttons functional
- **V1 Stabilization**: ✅ Complete - Strict mode separation verified via screenshots
- **Clean/Full Mode Toggle**: ✅ Working - visibly changes DOM layout
- **Auto/Manual PDRM Toggle**: ✅ Working - persists preference
- **Global Zoom Controls**: ✅ Working - syncs between views, persists
- **PDRM Tab**: ✅ Working - grouping and navigation verified
- **React-PDF**: No annotation errors in console
=======
- **Frontend Tests**: 100% pass rate (iteration_8)
- **All 6 tabs**: Verified working with pure view separation
- **PDF Upload**: ✅ Working
- **TOC Extraction**: ✅ Working (outline or fallback)
- **React-PDF**: No annotation errors
>>>>>>> origin/main
- **Firebase**: MOCKED (localStorage only)

## Prioritized Backlog

<<<<<<< HEAD
### P0 - Completed ✅
- V1 Stabilization (Strict Mode Separation)
- Clean/Full Mode Toggle in Surgeon View
- React-PDF Runtime Error Fix
- Auto-PDRM Classification
- Silent NoteLab Capture
- Recommended Next Action Engine

### P1 - Completed ✅
- Syllabus Mode
- Quick Study Feature
- Resume Last Session

### P0/P1 - Upcoming
- **Auto-TOC Generation & Navigation**: Verify `generateTOC` populates `tocStore`, implement "Open in Reader/Surgeon View" button handlers
- **Auto/Manual PDRM Toggle**: Add UI toggle in `PureSurgeonView`, persist choice, implement auto-classify logic

### P2 - Polish (Next)
- Full E2E test with PDF upload → highlight → quiz → study flow
- Test topic-filtered study sessions
- Syllabus File Upload parsing (PDF/DOCX/TXT)
=======
### ✅ COMPLETED - January 19, 2026 (V2.1 - Absorption Panel Enhanced)

#### P0: Absorption Panel Regenerates on Page Change (COMPLETED)
- Regenerates automatically when `currentPage` changes
- 400ms debounce to avoid spam while paging quickly
- Caching per `{pdfId, pageNumber}` - going back is instant
- Loading indicator shown during generation

#### P0: Auto-Highlight High-Yield Phrases (COMPLETED)
- High-yield spans detected using keyword patterns (PDRM)
- Colored highlighting using `<mark>` tags with border styling
- High-importance items auto-saved to NoteLab
- Deduplication by hash `{pdfId, page, textHash}` - no re-saves on refresh
- Tags: `['absorption_highlight', 'high-yield', 'auto', ...pdrm_tags]`

#### P0: Manual Highlighting in Absorption Panel (COMPLETED)
- Text selection triggers highlight menu with PDRM classification
- Saves to NoteLab + Study queue
- Auto-tag with PDRM classifier

#### P0: TOC Generation for Every Uploaded Book (COMPLETED)
- Native PDF outline/bookmarks first
- Fallback heuristic generator if no outline
- TOC links to pages in both Reader and Surgeon View

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
>>>>>>> origin/main

### P3 - Future Enhancements
- Firebase integration (when config provided)
- **Elena Mode** - Interactive speech learning
- Whiteboard explanations
- Full DOCX support with mammoth library
- OCR for scanned PDFs
- Cloud sync across devices

## Change Log

### January 2026 - V1 Stabilization
- **Fixed**: TOC sidebar leaking into Reader and Surgeon View tabs
- **Verified**: All 6 tabs render only their pure components
- **Verified**: Clean/Full/PDF toggle in Surgeon View changes DOM layout
- **Updated**: `pages/index.tsx` - removed shared TOC sidebar from main layout
- Firebase: MOCKED - using localStorage for persistence
- Guest mode: enabled (NEXT_PUBLIC_DISABLE_GOOGLE_SIGNIN=1)
- Build: Passes with no errors
