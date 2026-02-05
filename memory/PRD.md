# Surgeon-View PDRM - Product Requirements Document

## Original Problem Statement
Build a sophisticated study application for processing books and documents with:
1. **Strict Separation of Modes** - Reader, TOC, Surgeon View, NoteLab as independent views
2. **Auto-PDRM** - Automatic classification of highlights as Pattern, Decision, Risk/Mistake, or Mnemonic
3. **Auto-NoteLab** - Silent capture of highlights and quiz misses without interruption
4. **Recommended Next Action Engine** - Post-quiz recommendations based on weak areas
5. **Syllabus Mode** - Course-structured study system with topic tracking
6. **Quick Study** - Auto-find weakest items and create focused study sessions
7. **Resume Last Session** - Quick return to previous study position

## Target Users
- Medical students preparing for exams (DAT, MCAT, USMLE)
- Professionals studying dense technical material
- Anyone who needs to extract and organize key information from PDFs/documents

## Application Navigation (7 Tabs)
1. **📖 Reader** - Pure reading experience (PDF + thought-unit view)
2. **📑 TOC** - Dedicated Table of Contents tree (searchable, clickable)
3. **🔬 Surgeon View** - Active learning (highlighting, PDRM tagging, quizzes)
4. **📝 NoteLab** - Review workspace (notes, highlights, quiz misses)
5. **🧠 Study** - Flashcard study session with spaced repetition
6. **📋 Syllabus** - Course-structured study planning with topic tracking
7. **📊 PDRM** - PDRM entries grouped by document/chapter/page with navigation

## Core Features Status

### ✅ COMPLETED - January 2026

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

#### P0: Enhanced PDRM Generation ✅ January 2026
- "Important-only" heuristics (`isHighlightImportant` function):
  - Skips very short text (<15 chars)
  - Detects high-signal indicators (key, important, treatment, etc.)
  - Generates compact summary (max 200 chars)
  - Extracts 1-3 key points
- Source tracking: { docId, pageNumber, chapterTitle, highlightId, quote }
- Stored in pdrmStore with document grouping

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
- `updateTopicAfterStudy` updates status after study session

#### P1: Quick Study Feature
- ⚡ **Quick Study** button in Study tab and Syllabus tab
- Auto-finds weakest items (quiz misses, 'Again/Hard' history)
- Creates focused 10-20 card session
- Shows weak item count

#### P1: Resume Last Session
- ⏯️ **Resume** button in Study tab
- Returns to last card position
- Persists across sessions via localStorage

### Technical Implementation

#### studySessionStore Methods (New)
```typescript
startTopicSession(documentId, topicId, chapterIds, pageRanges) // Filtered by topic
startQuickStudy(documentId, maxCards, topicId?) // Weak items only
resumeLastSession() // Resume at lastSessionCardIndex
getTopicDeck(documentId, chapterIds, pageRanges) // Filtered deck
getWeakDeck(documentId, maxCards) // Weak/miss items
getWeakItemsCount(documentId) // Count weak items
hasLastSession() // Check for resumable session
```

#### syllabusStore Methods (New)
```typescript
updateTopicAfterStudy(topicId, sessionScore) // Update status based on score
linkHighlightToTopic(topicId, highlightId) // Track highlight counts
```

#### annotationStore Enhancement
- `addAnnotation` auto-tags: 'highlight', 'pattern', 'decision', 'mnemonic', 'weak'

## Technical Architecture

### Stack
- **Framework**: Next.js 14 (Pages Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand (4 stores with persist middleware)
- **Backend**: Firebase (MOCKED - localStorage only)
- **PDF**: react-pdf with pdfjs-dist

### Key Files
```
/app/lib/stores/
├── annotationStore.ts    # Highlights, PDRM tags (auto-tagging for silent capture)
├── quizStore.ts          # Chapter quiz, auto-flashcard creation
├── studySessionStore.ts  # Study sessions, Quick Study, Resume, topic filtering
├── syllabusStore.ts      # Topics, progress tracking, study integration
├── tocStore.ts           # Table of Contents with document grouping
├── zoomStore.ts          # Global zoom state with persistence
└── pdrmStore.ts          # PDRM entries with grouping and "important-only" filtering

/app/components/
├── SmartPDFViewer.tsx    # PDF rendering with defensive guards
├── PureReaderView.tsx    # Pure reading mode (uses global zoom)
├── PureTocView.tsx       # Pure TOC mode with navigation buttons
├── PureSurgeonView.tsx   # Pure surgeon mode with Auto/Manual PDRM
├── PurePdrmView.tsx      # PDRM entries view with grouping
├── PureNoteLabView.tsx   # Pure notelab mode
├── SyllabusModePanel.tsx # Syllabus with Quick Study
├── StudySessionPanel.tsx # Study with Quick Study + Resume
└── TocTreeSidebar.tsx    # Clickable TOC tree
```

## Testing Status
- **Build**: ✅ Passes
- **Unit Tests**: 20/20 passed (100%)
- **UI Tests**: All 7 tabs verified, all buttons functional
- **V1 Stabilization**: ✅ Complete - Strict mode separation verified via screenshots
- **Clean/Full Mode Toggle**: ✅ Working - visibly changes DOM layout
- **Auto/Manual PDRM Toggle**: ✅ Working - persists preference
- **Global Zoom Controls**: ✅ Working - syncs between views, persists
- **PDRM Tab**: ✅ Working - grouping and navigation verified
- **React-PDF**: No annotation errors in console
- **Firebase**: MOCKED (localStorage only)

## Prioritized Backlog

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

### P3 - Future Enhancements
- Firebase integration (when config provided)
- **Elena Mode** - Interactive speech learning (next milestone per user roadmap)
- Whiteboard (after speech foundation is solid)
- Full DOCX support
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
