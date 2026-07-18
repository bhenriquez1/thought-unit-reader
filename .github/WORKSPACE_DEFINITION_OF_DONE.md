# Avrrio Reader — Workspace Definition of Done

A workspace is **production-ready** when it satisfies every item in its category and workspace-specific section below.
PRs that add features to a workspace must not regress any previously passing item.

---

## Universal Categories

### Stability

- [ ] No known race conditions between concurrent state updates
- [ ] Every async fetch that can be superseded uses an `AbortController` and checks `signal.aborted` before writing state
- [ ] All `useEffect` cleanup functions cancel timers, clear refs, and abort in-flight requests
- [ ] No duplicate state ownership: each piece of data has exactly one canonical store (see `STABILITY_GUIDELINES.md`)
- [ ] `playbackState` in `ReadingFocusStore` is the single authority on whether speech is active — no parallel flags

### Performance

- [ ] No `useEffect` or `useCallback` dependency arrays that include derived objects created inline (use `useMemo`)
- [ ] Callbacks passed to child components are stable (`useCallback`) — not recreated on every render
- [ ] Stale closure patterns using refs (`speedRef`, `segIdxRef`) are in place wherever a callback must read the latest value of state it cannot close over
- [ ] No unconditional `console.log` in hot paths (PDF scroll callbacks, TTS word callbacks, highlight overlay rebuild)
- [ ] Large books (300+ pages) remain smooth — no O(n·pages) operations on each page change

### UX

- [ ] Every async operation has a loading state visible to the user
- [ ] Every error path surfaces a human-readable message in the UI — no silent `console.error`-only failures
- [ ] Empty states are meaningful (explain why empty and what to do), not blank or hidden by CSS overflow
- [ ] Destructive or irreversible actions require confirmation
- [ ] Keyboard navigation works for all primary interactions (Tab, Enter, Escape, arrow keys where applicable)
- [ ] Layouts are responsive within the panel they occupy; no horizontal scroll on the body

### Reliability

- [ ] State that must survive refresh is persisted (IndexedDB via `idbStore`, `localStorage`, or Zustand `partialize`)
- [ ] State that must not persist across books is cleared on book change
- [ ] Navigation from any deep state returns to a valid UI (no broken empty panels)
- [ ] Offline / API-unavailable states show a clear fallback — no unhandled promise rejections

### Quality

- [ ] `npx tsc --noEmit` produces no new errors (pre-existing SDK union errors in `claudeEnrichment.ts` / `exam-question-gen.ts` / `study-plan-diagnostic.ts` are known exceptions)
- [ ] ESLint passes (`next lint`)
- [ ] Build succeeds (`next build`)
- [ ] CI (CodeQL) is green on the PR

---

## Workspace-Specific Checklists

### 📖 Reader

- [ ] Highlighting: `ReadingFocusStore.thoughtUnitId` is the single canonical anchor ID; `SmartPDFViewer`, `RightPanel`, `StudySpeechPanel`, and `ThoughtUnitNavigator` all read from it
- [ ] No competing scroll effects: `ThoughtUnitNavigator` scroll is gated by `playbackState === 'idle'` before firing
- [ ] `userFocusLockedUntilRef` (1.5 s window) prevents scroll-sync from overwriting a card-click focus
- [ ] `audioCacheRef` is cleared on book and page change — no stale blobs played on new pages
- [ ] OCR repair fetch uses `AbortController` tied to `pageRef` — stale repair results never update state after page turn
- [ ] `playFromSnippet` claims the global speech token before calling `fetchAndPlayAudio`
- [ ] Speed slider takes effect mid-utterance (browser SpeechSynthesis restarts via `speedRef`; HTML audio sets `playbackRate` live)

### 📝 NoteLab / Study Sheet

- [ ] `canonicalAnchors` is capped to 15 entries both client-side (`.slice(0, 10)`) and server-side (`MAX_ANCHORS = 15`) before prompt injection
- [ ] Regeneration failures show an inline error message — not only `console.error`
- [ ] Profile auto-detection confidence is visible to the user; manual override is available
- [ ] Validation issues display human-readable `issue.message`, never raw `issue.code`
- [ ] `filterShallowSections` removes sections with < 30 chars or > 75% overlap with `coreIdea`

### 🎧 Listen (PodcastLab)

- [ ] Script generation uses `scriptFetchAbortRef` — mode or page change aborts in-flight generation
- [ ] `prebufferSegments` checks `abortRef.current` before each blob write — aborted runs never pollute the audio cache
- [ ] Play button is disabled (⏳) while `audioReady` is false — no live per-segment fetches during buffering
- [ ] ⟨10 / 10⟩ buttons scrub `audioRef.currentTime` ± 10 s, not segment-skip
- [ ] Each podcast mode uses distinct host and guest voices (no two identical voices in `PODCAST_MODES`)
- [ ] Empty state renders inside the scrollable `flex-1` container

### 🎯 DAT Apex

- [ ] `recalculate()` passes actual attempt times from `questionBank.attempts` to `updatePatternReadiness` — not empty arrays
- [ ] `adaptiveDifficulty` is derived from real session accuracy + time + trap resistance and persisted via `partialize`
- [ ] "Start Now" CTA wires `targetPatterns + adaptiveDifficulty` through `createWeakTopicsPractice` before routing
- [ ] `createWeakTopicsPractice` falls back to 5 weakest-seen patterns when no explicit target patterns are provided
- [ ] Proctor route receives a fully seeded `localStorage.currentExam` before navigation

### 🧠 Recall

- [ ] SM-2 interval is computed from actual attempt outcomes, not static schedules
- [ ] Confidence score is visible on each card face before and after review
- [ ] Mixed-topic review selects from across all card sets for the current book, not only the active set
- [ ] Recall state is book-scoped — reviewing Book A does not affect Book B's intervals

### 🏫 Learning Hub

- [ ] AI Coach `handleAskCoach` is a single `useCallback` — not duplicated in `onKeyDown` and `onClick`
- [ ] Coach context includes: `bookTitle`, `masteryPct`, `readPct`, `weakAreas`, `nextTopic`, `currentPage`, `totalPages`, `todayTopics`
- [ ] 7-day calendar strip only renders when `syllabusStudyPlan.length > 0`
- [ ] Knowledge Graph node list is sorted by importance and includes related-node chips
- [ ] Learning Hub sub-tab is the student's primary entry point after opening a book

### ✨ Elena Mode

- [ ] Gated behind `NEXT_PUBLIC_ELENA_MODE_ENABLED=true` — not rendered when flag is absent or false
- [ ] Profile, rewards, and progress are loaded in parallel (`Promise.all`) on mount
- [ ] `awardStar` correctly computes streak: `daysDiff <= 1` continues the streak; otherwise resets to 1
- [ ] All three tabs (Home, Library, Progress) render without errors when rewards or progress is null (first session)
- [ ] No hard-coded child name — all labels pass through `getChildDisplayCopy(profile)`
- [ ] Rewards are saved to IndexedDB immediately after `awardStar` — not deferred to the next navigation
