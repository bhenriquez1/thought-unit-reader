# Avrrio Reader — Engineering Roadmap

Living document. Updated at the start of each sprint.
Completed milestones move to the bottom; future ideas live at the top.

---

## Current Sprint — TOC Engine

**Goal:** Upload any PDF → automatically generate a high-quality, navigable table of contents.

This is the highest-priority foundational work because every other feature (Learning Hub roadmap, Book Roadmap tab, study plan, AI recommendations) degrades when the TOC is missing or wrong.

### Deliverables

- [ ] **PDF bookmark extraction** — parse embedded PDF outline (via `pdf.js` `getOutline()`) into the `SyllabusToc` structure
- [ ] **OCR heading detection** — when no bookmark outline exists, detect headings from font size + weight + position heuristics across sampled pages
- [ ] **Multi-level hierarchy** — support Part / Chapter / Section / Subsection nesting; flatten gracefully when depth is ambiguous
- [ ] **Page-number correction** — reconcile logical page numbers (from the PDF) with physical page numbers (1-indexed display pages) using the `pageOffset` field already in `SyllabusToc`
- [ ] **Duplicate cleanup** — merge or discard entries with the same title and consecutive page ranges
- [ ] **Click-to-navigate** — every TOC entry in the TocTree navigates to the correct physical page
- [ ] **Fallback** — when neither bookmarks nor detectable headings exist, generate a synthetic TOC from page-level thesis sentences via the existing `pageIntelligence` pipeline
- [ ] **Books with no structure** — degrade gracefully to a single-level "All Pages" TOC that still enables the study plan and calendar features

### Files likely touched

```
lib/tocParser.ts
lib/syllabusParser/coursePlanner.ts
components/syllabus/TocTree.tsx
pages/api/syllabus-parse.ts (or new /api/toc-extract.ts)
```

---

## Next Sprint — Reader Stabilization

**Goal:** The Reader is the foundation. Make it feel professional on any book.

### Deliverables

- [ ] **Highlight overlay accuracy** — overlay bounding boxes match the PDF text layer at all zoom levels
- [ ] **OCR repair quality** — identify and fix the most common OCR failure modes (ligatures, hyphenated words across lines, two-column layout confusion)
- [ ] **Annotation persistence** — pinned highlights and margin notes survive page navigation and book reload
- [ ] **Keyboard navigation** — `j/k` or arrow keys move through thought units; `Enter` focuses the Right Panel card
- [ ] **Large book performance** — 500-page PDFs remain smooth; `SmartPDFViewer` virtualizes off-screen page renders

---

## Sprint 3 — Recall Depth

**Goal:** Make existing Recall data visible and actionable. No new data infrastructure needed — the SM-2 intervals and attempt history already exist.

### Deliverables

- [ ] **Confidence UI** — each card shows its current confidence score (0–100) and next review date before and after flipping
- [ ] **Interval history** — sparkline or timeline of a card's past intervals on the card back
- [ ] **Difficulty trend** — aggregate view of retrieval difficulty per topic over the last 30 days
- [ ] **Mixed-topic review** — "Review All" mode draws cards from every set for the current book, ordered by urgency (overdue first)
- [ ] **Retention analytics** — simple chart in the Learning Hub showing retention curve per book

---

## Sprint 4 — Learning Hub Depth

**Goal:** Make the Learning Hub the student's primary home for every session.

### Deliverables

- [ ] **AI Coach — attempt-level context** — pass `apexEngineStore.questionBank.attempts` (last 50, filtered to slow/wrong) to the AI Coach so it can make recommendations like "You consistently miss spectroscopy questions after 90 s — focus on IR interpretation first"
- [ ] **Weekly goals** — configurable daily/weekly page target with progress ring
- [ ] **Study streak** — cross-book streak counter with history (separate from Elena's child-facing streak)
- [ ] **Cross-book progress** — summary card showing mastery % across all uploaded books
- [ ] **Calendar improvements** — show past 7 days with completion indicators alongside the upcoming 7-day strip

---

## Sprint 5 — DAT Apex Maturity

**Goal:** Turn Apex into a dedicated preparation platform using the attempt data that's already being collected.

### Deliverables

- [ ] **Blueprint gap analysis** — map `patternReadiness` scores onto the official DAT blueprint sections and show which areas are below 70% readiness
- [ ] **Performance trends** — per-session accuracy and time charts over the past 30 sessions
- [ ] **Smarter adaptive difficulty** — `computeNextDifficulty` currently uses only 3 signals; add trap resistance trend and recency weighting
- [ ] **Personalized daily practice** — a "Do This Today" session generated each morning from blueprint gaps + low-readiness patterns + due recall cards

---

## Sprint 6 — NoteLab Depth

**Goal:** NoteLab should feel like a unified knowledge workspace, not a collection of separate tools.

### Deliverables

- [ ] **Linked notes** — a note can reference another note by anchor ID; clicking the link navigates to the linked note's source page
- [ ] **Version history** — keep the last 3 generated Study Sheets per note so the student can revert if a regeneration is worse
- [ ] **KnowledgeGraph integration** — generating a Study Sheet for a concept automatically creates or updates the corresponding `kgNode`
- [ ] **Folder / tag organization** — notes can be tagged with subject areas or custom labels; tag filter in the notes list
- [ ] **Export** — export a Study Sheet as a formatted PDF (using existing `/api/tts` pattern for server-side rendering)

---

## Sprint 7 — Elena Mode Expansion

**Goal:** Elena Mode as a standalone child learning experience with parent visibility.

### Deliverables

- [ ] **Parent dashboard** — separate view (behind a PIN or the parent account) showing session history, streak, time spent, and achievement progress
- [ ] **Reading adventures** — each "session logged" event generates a short AI-narrated recap of what was read (child-safe, age-appropriate)
- [ ] **Rewards tied to learning** — stars are awarded for specific actions (finish a chapter, earn a new recall card) in addition to manual session logging
- [ ] **Child-safe AI explanations** — age-appropriate "Explain This" for any word or sentence the child highlights, gated behind `ageRange`
- [ ] **Progress reports** — weekly summary email or in-app report for the parent (reading time, new words, streak)

---

## Engineering Health (Ongoing)

These items have no sprint assignment — they are addressed as related PRs touch the relevant areas.

- [ ] **Automated smoke tests** — Playwright tests for the Reader golden path (upload PDF → navigate → highlight → speech) and the DAT Apex flow (start exam → submit → see results)
- [ ] **Bundle size audit** — `next/bundle-analyzer` pass; identify and lazy-load anything > 100 KB that isn't needed on the initial Reader render
- [ ] **Error boundary coverage** — every workspace tab has an `<ErrorBoundary>` so a crash in Elena doesn't crash the Reader
- [ ] **Accessibility audit** — screen-reader pass on the Reader and Learning Hub; ARIA labels on all interactive elements

---

## Completed Milestones

### PR #515 — Stabilization + Platform Depth (July 2026)

**Stability**
- 5 Reader race conditions fixed (RC-2 through RC-5, karaoke rate, competing scrolls)
- 9 TTS issues fixed (token claim, AbortController, stale timer cleanup, speed slider, cache clear)
- 6 PodcastLab bugs fixed (stale fetch, phantom TTS, skip buttons, early play, indistinct voices, empty state)
- Dead `activeParagraphId` field removed from `useHighlightStore`
- Server-side anchor cap (MAX 15) added to `adaptive-study-sheet.ts` and `dat-study-sheet.ts`
- Regeneration errors surfaced in the Study Sheet UI

**Features**
- Learning Hub: 8 sub-tabs (Overview, Today, Roadmap, Study Plan, Mastery, Weak Areas, Exam Readiness, Knowledge Graph, AI Coach)
- AI Coach endpoint (`/api/ai-coach.ts`) with personalized coaching context
- DAT Apex: `createWeakTopicsPractice`, `computeNextDifficulty` wired, "Start Now" CTA
- Elena Mode: Rewards system (stars, streaks, 7 achievements), Library tab, Progress tab
- NoteLab: adaptive Study Sheet profile system with 8 domain profiles

**Cleanup**
- `handleAskCoach` extracted from duplicate inline handlers
- Unused `UnderConstructionPanel` import removed
- NoteLab sub-tab labels renamed to student language
